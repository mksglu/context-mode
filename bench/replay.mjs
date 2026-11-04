// bench/replay.mjs - offline context-saving replay (method: bench/README.md).
// Streams ~/.claude/projects/*/*.jsonl, pairs tool_use with tool_result, and compares the bytes the model
// received (before) with the bytes v2 would return (after). Uses the v2 source as a library (Node type stripping).
// Usage: node bench/replay.mjs [--out <aggregate.json>] [--limit-files N]
// Private per-session rows go to /private/tmp/cm-v2-impl-private/bench/sessions.json, never into the repo.
import { createReadStream, statSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lib = (p) => import(path.join(ROOT, p));
const { decide } = await lib("src/core/policy/decide.ts");
const { getAdapter } = await lib("src/adapters/table.ts");
const { capBytes } = await lib("src/core/sandbox/cap.ts");
const { chunkText } = await lib("src/core/index/chunk.ts");
const { selectChunksInMemory } = await lib("src/core/index/select.ts");
const C = await lib("src/core/contracts/constants.ts");
const { READ_DENY_MESSAGE } = await lib("src/core/policy/read-deny.ts");

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg("--out", path.join(ROOT, "bench", "offline-aggregate.json"));
const LIMIT_FILES = Number(arg("--limit-files", "0"));
const PRIVATE = "/private/tmp/cm-v2-impl-private/bench";
const MAX_FILE = 200 * 1024 * 1024;
const row = getAdapter("claude-code");
const OWN_PREFIX = row.toolNamePrefix;
const OUTPUT_CAP = C.OUTPUT_CAP;
const bytes = (s) => Buffer.byteLength(s, "utf8");
const OWN_RE = /^mcp__(?:plugin_)?context[-_]mode.*?__(ctx_[a-z_]+)$/;
const ctxNames = new Set(C.TOOL_ORDER);

function canonicalName(name) {
  if (name.startsWith(OWN_PREFIX)) return name.slice(OWN_PREFIX.length);
  if (!name.startsWith("mcp__")) return name;
  const rest = name.slice(5);
  const sep = rest.indexOf("__");
  return sep < 0 ? name : "mcp:" + rest.slice(0, sep) + ":" + rest.slice(sep + 2);
}
function group(name) {
  const m = OWN_RE.exec(name);
  if (m && ctxNames.has(m[1])) return m[1];
  if (name.startsWith("mcp__")) return "mcp:other";
  return name;
}
function resultText(content) {
  if (typeof content === "string") return { text: content, images: 0 };
  if (!Array.isArray(content)) return { text: "", images: 0 };
  let images = 0;
  const parts = [];
  for (const b of content) {
    if (b && b.type === "text" && typeof b.text === "string") parts.push(b.text);
    else if (b && b.type === "image") images++;
  }
  return { text: parts.join("\n"), images };
}

// Per-tool, per-session accumulators.
const toolTotals = new Map(); // tool -> {calls, before, after, afterBound, deny, hint, replace}
const buckets = {}; // tool|ALL -> bucket -> sums
const perSession = []; // {id, tools: {tool: [calls, before, after, afterBound]}}
const meta = { files: 0, skippedBig: 0, sessions: 0, calls: 0, images: 0, decideErrors: 0, unpaired: 0, versions: {}, models: {}, firstTs: null, lastTs: null };
const tot = (t) => {
  let x = toolTotals.get(t);
  if (!x) toolTotals.set(t, (x = { calls: 0, before: 0, after: 0, afterBound: 0, deny: 0, hint: 0, replace: 0 }));
  return x;
};

async function replayFile(file) {
  const uses = new Map(); // id -> {name, input, side, cwd}
  const seenResult = new Set();
  const sess = {};
  let sessionId = "";
  let lastPrompt = "";
  let any = false;
  const rl = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of rl) {
    const hasUse = line.includes('"tool_use"');
    const hasRes = line.includes('"tool_result"');
    const maybePrompt = !hasUse && !hasRes && line.includes('"type":"user"');
    if (!hasUse && !hasRes && !maybePrompt) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (maybePrompt) {
      // D-M7-SV-5: the main agent's last typed prompt, as the UserPromptSubmit hook journals it.
      if (o.type === "user" && o.isSidechain !== true && o.isMeta !== true && o.message) {
        const c = o.message.content;
        const t = typeof c === "string" ? c : Array.isArray(c) ? c.filter((x) => x && x.type === "text" && typeof x.text === "string").map((x) => x.text).join("\n") : "";
        if (t.trim() !== "") lastPrompt = t;
      }
      continue;
    }
    const content = o.message && o.message.content;
    if (!Array.isArray(content)) continue;
    if (typeof o.sessionId === "string") sessionId = o.sessionId;
    if (typeof o.timestamp === "string") {
      if (meta.firstTs === null || o.timestamp < meta.firstTs) meta.firstTs = o.timestamp;
      if (meta.lastTs === null || o.timestamp > meta.lastTs) meta.lastTs = o.timestamp;
    }
    for (const b of content) {
      if (b && b.type === "tool_use" && typeof b.id === "string") {
        if (!uses.has(b.id)) uses.set(b.id, { name: String(b.name), input: b.input && typeof b.input === "object" ? b.input : {}, side: o.isSidechain === true, cwd: typeof o.cwd === "string" ? o.cwd : "" });
        if (typeof o.version === "string") meta.versions[o.version] = (meta.versions[o.version] || 0) + 1;
        if (o.message.model) meta.models[o.message.model] = (meta.models[o.message.model] || 0) + 1;
      } else if (b && b.type === "tool_result" && typeof b.tool_use_id === "string") {
        if (seenResult.has(b.tool_use_id)) continue;
        seenResult.add(b.tool_use_id);
        const u = uses.get(b.tool_use_id);
        if (!u) { meta.unpaired++; continue; }
        uses.delete(b.tool_use_id);
        const { text, images } = resultText(b.content);
        meta.images += images;
        const before = bytes(text);
        const g = group(u.name);
        let after = before;
        let afterBound = before;
        let kind = "allow";
        const own = OWN_RE.test(u.name) && ctxNames.has(OWN_RE.exec(u.name)[1]);
        if (!own) {
          const canonical = canonicalName(u.name);
          const ev = { event: "PreToolUse", agent: "claude-code", sessionId: sessionId || file, cwd: u.cwd, tool: { name: u.name, canonicalName: canonical, input: u.input } };
          if (u.side) ev.agentId = "sub"; // subagent marker (toolSet unknown -> case C)
          let d = { kind: "allow" };
          try {
            if (canonical === "Read") {
              // The file on disk is gone or changed: use the result bytes as the size (README, approximation 1).
              const noRange = u.input.offset == null && u.input.limit == null;
              const p = u.input.file_path;
              if (noRange && typeof p === "string" && before > OUTPUT_CAP) d = { kind: "deny", reason: READ_DENY_MESSAGE(path.resolve(u.cwd || "/", p), before) };
              else d = decide({ ...ev, tool: { ...ev.tool, input: { ...u.input, file_path: "/nonexistent-offline-replay/x" } } }, row, []);
            } else d = decide(ev, row, []);
          } catch { meta.decideErrors++; }
          if (d.kind === "deny") {
            kind = "deny";
            after = bytes(d.reason);
            afterBound = after + bytes(capBytes(text, OUTPUT_CAP).text);
          } else {
            // PostToolUse replace: main agent (D-M7-RR-1) and subagent case C, with the replace-path sizes of
            // src/core/hooks/dispatch.ts (D-M7-SV-1): trigger, chunk cap and return budget, not OUTPUT_CAP.
            if (before > C.REPLACE_TRIGGER_BYTES) {
              // Same intent order as dispatch (D-M7-RR-3) and the last-prompt ranking (D-M7-SV-5).
              const intent = [u.input.description, u.input.command, u.input.file_path, u.input.pattern, u.input.url].map((v) => (typeof v === "string" ? v : "")).find((v) => v.trim() !== "") ?? "";
              const rankQuery = lastPrompt.trim() === "" ? undefined : intent + " " + lastPrompt;
              const sel = selectChunksInMemory(chunkText(text, "text", C.REPLACE_CHUNK_BYTES), intent, C.REPLACE_RETURN_BYTES, "replay:" + canonical, rankQuery);
              after = bytes(sel.text) + (sel.more !== null ? 1 + bytes(sel.more) : 0);
              afterBound = after;
              kind = "replace";
            }
          }
        }
        const t = tot(g);
        t.calls++; t.before += before; t.after += after; t.afterBound += afterBound;
        if (kind === "deny") t.deny++; else if (kind === "hint") t.hint++; else if (kind === "replace") t.replace++;
        const bk = before <= 1024 ? "<=1K" : before <= 4096 ? "1-4K" : before <= 16384 ? "4-16K" : before <= 65536 ? "16-64K" : ">64K";
        for (const key of [g, "ALL"]) { const bb = ((buckets[key] ||= {})[bk] ||= { calls: 0, before: 0, after: 0, afterBound: 0, deny: 0, replace: 0 }); bb.calls++; bb.before += before; bb.after += after; bb.afterBound += afterBound; if (kind === "deny") bb.deny++; else if (kind === "replace") bb.replace++; }
        const s = (sess[g] ||= [0, 0, 0, 0]);
        s[0]++; s[1] += before; s[2] += after; s[3] += afterBound;
        meta.calls++;
        any = true;
      }
    }
  }
  if (any) { meta.sessions++; perSession.push({ id: path.basename(file), tools: sess }); }
}

const base = path.join(homedir(), ".claude", "projects");
const files = [];
for (const d of readdirSync(base)) {
  let ents = [];
  try { ents = readdirSync(path.join(base, d)); } catch { continue; }
  for (const f of ents) if (f.endsWith(".jsonl")) files.push(path.join(base, d, f));
}
let n = 0;
for (const f of files) {
  if (LIMIT_FILES && n >= LIMIT_FILES) break;
  let size = 0;
  try { size = statSync(f).size; } catch { continue; }
  meta.files++;
  if (size > MAX_FILE) { meta.skippedBig++; console.error("skip >200MB: " + path.basename(f)); continue; }
  n++;
  try { await replayFile(f); } catch (e) { console.error("file failed: " + path.basename(f) + " " + e.message); }
  if (n % 100 === 0) console.error(`${n}/${files.length} files, ${meta.calls} calls`);
}

const pct = (b, a) => (b > 0 ? ((b - a) / b) * 100 : 0);
const q = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.max(0, Math.ceil(p * s.length) - 1)]; };
function sessionStats(pick) {
  const v = [];
  for (const s of perSession) { const r = pick(s); if (r && r[1] > 0) v.push(pct(r[1], r[2])); }
  return { sessions: v.length, medianPct: q(v, 0.5), p90Pct: q(v, 0.9) };
}
function sessionStatsBound(pick) {
  const v = [];
  for (const s of perSession) { const r = pick(s); if (r && r[1] > 0) v.push(pct(r[1], r[3])); }
  return { medianPct: q(v, 0.5), p90Pct: q(v, 0.9) };
}
const tools = {};
for (const [name, t] of [...toolTotals].sort((a, b) => b[1].before - a[1].before)) {
  tools[name] = { ...t, savingPct: pct(t.before, t.after), savingPctWithRerunBound: pct(t.before, t.afterBound), ...sessionStats((s) => s.tools[name]), perSessionWithRerunBound: sessionStatsBound((s) => s.tools[name]) };
}
const sum = (f) => [...toolTotals.values()].reduce((a, t) => a + t[f], 0);
const sumCalls = sum("calls"), sumB = sum("before"), sumA = sum("after"), sumAB = sum("afterBound");
const total = {
  calls: sumCalls, before: sumB, after: sumA, afterBound: sumAB, savingPct: pct(sumB, sumA), savingPctWithRerunBound: pct(sumB, sumAB),
  deny: sum("deny"), hint: sum("hint"), replace: sum("replace"),
  ...sessionStats((s) => Object.values(s.tools).reduce((a, r) => [a[0] + r[0], a[1] + r[1], a[2] + r[2], a[3] + r[3]], [0, 0, 0, 0])),
  perSessionWithRerunBound: sessionStatsBound((s) => Object.values(s.tools).reduce((a, r) => [a[0] + r[0], a[1] + r[1], a[2] + r[2], a[3] + r[3]], [0, 0, 0, 0])),
};
const topN = (o, k) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k);
const agg = {
  date: new Date().toISOString().slice(0, 10), node: process.version, outputCap: OUTPUT_CAP, mcpHintEvery: C.MCP_HINT_EVERY,
  corpus: { files: meta.files, skippedOver200MB: meta.skippedBig, sessions: meta.sessions, calls: meta.calls, imageBlocksNotCounted: meta.images, unpairedResults: meta.unpaired, decideErrors: meta.decideErrors, firstTs: meta.firstTs, lastTs: meta.lastTs, claudeCodeVersions: topN(meta.versions, 8), modelsOnToolUseTurns: topN(meta.models, 8) },
  total, tools, buckets,
};
writeFileSync(OUT, JSON.stringify(agg, null, 2) + "\n");
mkdirSync(PRIVATE, { recursive: true });
writeFileSync(path.join(PRIVATE, "sessions.json"), JSON.stringify(perSession));
console.log(JSON.stringify({ total, corpus: agg.corpus }, null, 1));
