// impl/05 §3 (ctx_index), §4 (SSRF lives in sandbox/fetch.ts), impl/00 §4 (indexText), DECISIONS-r9 M23
// (ONE_OF_INPUT text from the canonical 00 §3.3 table), DEVIATIONS D-M2-1 (ftsInsert owns the id and
// the write batches), D-M2-2 (journal facts on the reply), D-M2-6 (capBytes is a final bound), D-M2-T8-1,
// ADR-0009 §8.2 + D-M4-arch-5 (a user label "decision" is stored as "decision (user)").
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { z } from "zod/v4";
import { DECISION_SOURCE, DECISION_USER_LABEL, ECHO_MAX_BYTES, EXEC_TIMEOUT_MS, OUTPUT_CAP } from "../contracts/constants.ts";
import { CtxError } from "../contracts/errors.ts";
import type { CtxIndexInput, DbHandle, ProjectContext, SourceKind, ToolContext, ToolReply } from "../contracts/types.ts";
import { walkDir } from "../index/walk.ts";
import { isInside } from "../project/contain.ts";
import { capBytes } from "../sandbox/cap.ts";
import { safeFetch } from "../sandbox/fetch.ts";
import { unknownField } from "./search.ts";
import { closeDb, openDb } from "../store/db.ts";
import { sourceHandle } from "../store/fts.ts";
import { indexText, storeText, type ChunkKind } from "../index/text.ts";
import { hasMdStructure } from "../index/chunk.ts";
import { htmlToReadable } from "../index/html-text.ts";
import { RAW_LABEL_SUFFIX } from "../store/fts.ts";

export type { CtxIndexInput } from "../contracts/types.ts";
export { indexText };

export const ctxIndexSchema = z.object({
  path: z.string().optional(),
  content: z.string().optional(),
  url: z.string().optional(),
  source: z.string().optional(),
}, { error: unknownField }).strict(); // 00 §5.2 step 1: the SDK's isError line is UNKNOWN_FIELD

// The three input fields, in the order the error line names them.
const INPUT_FIELDS = ["path", "content", "url"] as const;
// File-name and media-type facts of the formats chunkText reads (not tunables).
const EXT_KIND: Readonly<Record<string, ChunkKind>> = Object.freeze({ ".md": "md", ".html": "html", ".htm": "html" });
const TYPE_KIND: Readonly<Record<string, ChunkKind>> = Object.freeze({ "text/html": "html", "text/markdown": "md" });
const DEFAULT_CONTENT_LABEL = "content";
const utf8 = new TextDecoder("utf-8", { fatal: true });

// One text to index. `read` runs only when the item is stored, so a folder never holds every file at once.
interface Item { sourceKind: SourceKind; label: string; kind: ChunkKind; read(): string | undefined; base?: string; }

// ADR-0009 §8.2: "decision" is the reserved ctx_search source; a user text with that label is renamed
// once, for every branch, so the reserved label only ever names decision rows.
function userLabel(label: string): string {
  return label === DECISION_SOURCE ? DECISION_USER_LABEL : label;
}

function kindOfPath(p: string): ChunkKind {
  return EXT_KIND[extname(p).toLowerCase()] ?? "text";
}

function kindOfType(contentType: string): ChunkKind {
  const semi = contentType.indexOf(";");
  const media = (semi < 0 ? contentType : contentType.slice(0, semi)).trim().toLowerCase();
  return TYPE_KIND[media] ?? "text";
}

// A file that is not valid UTF-8 is binary: it is skipped, not an error (impl/05 §3 step 2).
function readUtf8(absPath: string): string | undefined {
  try {
    return utf8.decode(readFileSync(absPath));
  } catch {
    return undefined;
  }
}

// isInside is false for a path that does not exist (D-M1-T3-4). A missing path whose nearest existing
// parent is inside the project is a bad argument, not an escape; anything else is OUTSIDE_ROOT, so the
// reply never tells whether a path outside the project exists.
function missingOrOutside(given: string, abs: string, root: string): CtxError {
  let dir = abs;
  while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir);
  if (dir !== abs && isInside(root, dir)) return new CtxError("INVALID_ARGS", { field: "path", action: "pass an existing file or folder" });
  return new CtxError("OUTSIDE_ROOT", { p: given, root });
}

// Step 2, path branch. One containment rule for files and folders: the shared isInside (#954, #1294).
function pathItems(input: CtxIndexInput & { path: string }, project: ProjectContext): Item[] {
  const abs = resolve(project.worktree, input.path);
  if (!isInside(project.containmentRoot, abs)) throw missingOrOutside(input.path, abs, project.containmentRoot);
  const base = relative(project.worktree, abs);
  if (statSync(abs).isDirectory()) {
    return walkDir(abs, project.containmentRoot).map((f) => ({
      sourceKind: "path",
      label: join(base, f.relPath),
      kind: kindOfPath(f.relPath),
      read: () => readUtf8(f.absPath),
    }));
  }
  return [{ sourceKind: "path", label: base === "" ? input.path : base, kind: kindOfPath(abs), read: () => readUtf8(abs) }];
}

async function itemsOf(input: CtxIndexInput, ctx: ToolContext): Promise<{ items: Item[]; from: string }> {
  if (input.content !== undefined) {
    const text = input.content;
    const label = input.source ?? DEFAULT_CONTENT_LABEL;
    // D-SEARCH-1: inline markdown (a heading or a fence) is chunked by heading, fences kept whole.
    const kind: ChunkKind = hasMdStructure(text) ? "md" : "text";
    return { items: [{ sourceKind: "content", label, kind, read: () => text }], from: label };
  }
  if (input.path !== undefined) {
    const items = pathItems({ ...input, path: input.path }, ctx.project);
    return { items, from: items.length === 1 ? items[0].label : input.path };
  }
  // url: safeFetch owns proxy env and the per-hop SSRF check; its CtxError is the reply (P1, one path).
  // 00 §5.2 step 3 / Q8: the handler runs under cancel and EXEC_TIMEOUT_MS, so a server that never
  // answers ends as FETCH_FAILED, not a hung call. AbortSignal.timeout does not hold the event loop.
  const res = await safeFetch(input.url ?? "", AbortSignal.any([ctx.signal, AbortSignal.timeout(EXEC_TIMEOUT_MS)]));
  const text = res.body.toString("utf8");
  const label = res.finalUrl;
  return { items: [{ sourceKind: "url", label, kind: kindOfType(res.contentType), read: () => text, base: label }], from: label };
}

async function handler(input: CtxIndexInput, ctx: ToolContext): Promise<ToolReply> {
  // Step 1.
  const given = INPUT_FIELDS.filter((f) => input[f] !== undefined);
  if (given.length !== 1) return { text: new CtxError("ONE_OF_INPUT", { names: INPUT_FIELDS.join(", ") }).toLine(), isError: true, sandboxBytes: 0 };
  try {
    const got = await itemsOf(input, ctx);
    const items = got.items.map((it) => ({ ...it, label: userLabel(it.label) }));
    const from = userLabel(got.from);
    // Steps 3-4: one sources row per text, written by ftsInsert in INDEX_WRITE_CHUNK batches.
    const db = await openDb(ctx.project);
    let sources = 0;
    let chunks = 0;
    let bytes = 0;
    let lastId = 0;
    const notes: string[] = [];
    try {
      for (const it of items) {
        const text = it.read();
        if (text === undefined) continue;
        bytes += Buffer.byteLength(text, "utf8");
        if (it.kind === "html") {
          // D-HTML-READABLE-1: the readable text is ranked; the raw body is kept next to it as "<label> (raw)".
          let readable: ReturnType<typeof htmlToReadable> | undefined;
          try { readable = htmlToReadable(text, it.base); } catch { readable = undefined; }
          if (readable !== undefined) {
            const rawLabel = it.label + RAW_LABEL_SUFFIX;
            const raw = storeText(db, ctx.project, ctx.sessionId, it.sourceKind, rawLabel, text, "text");
            notes.push("Raw HTML kept as \"" + rawLabel + "\" (" + raw.chunks + " chunk(s)); pass it as `source` to search the markup.");
            lastId = raw.sourceId;
            if (readable.words === 0 || readable.sparse) {
              notes.unshift("No readable text found in " + it.label + " (the page is client-rendered or empty); nothing was added to default search.");
              continue;
            }
            const stored = storeText(db, ctx.project, ctx.sessionId, it.sourceKind, it.label, readable.text, "md");
            chunks += stored.chunks;
            lastId = stored.sourceId;
            sources += 1;
            continue;
          }
        }
        const stored = storeText(db, ctx.project, ctx.sessionId, it.sourceKind, it.label, text, it.kind);
        chunks += stored.chunks;
        lastId = stored.sourceId;
        sources += 1;
      }
    } finally {
      closeDb(db);
    }
    // Step 6; step 5 is the server's one journal row, fed by `journal` (D-M2-2).
    // D-NO-LOSSY-CUT-2: a long label is stored whole; the reply names it by its handle (ctx_search source accepts it).
    const shown = Buffer.byteLength(from, "utf8") > ECHO_MAX_BYTES ? sourceHandle(lastId) : from;
    const line = ["Indexed " + sources + " source(s), " + chunks + " chunk(s) from " + shown + ".", ...notes].join("\n");
    return {
      text: capBytes(line, OUTPUT_CAP).text,
      isError: false,
      sandboxBytes: bytes,
      journal: { kind: "index", key: from, path: from, exit_code: null },
    };
  } catch (err) {
    if (err instanceof CtxError) return { text: err.toLine(), isError: true, sandboxBytes: 0 };
    throw err;
  }
}

export const ctxIndex = {
  name: "ctx_index",
  schema: ctxIndexSchema,
  readOnly: false,
  alwaysLoad: false,
  handler,
} as const;
