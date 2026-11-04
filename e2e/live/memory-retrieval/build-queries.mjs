#!/usr/bin/env node
// Builds journals and retrieval queries with structural gold labels from real
// Claude Code transcripts. No model calls. All output is private (/tmp).
//
// Query types (gold comes from transcript structure only):
//   errorfix  query = first line of an error that recurs later; gold = the earlier toolerr rows with the same line
//   file      query = the user prompt before a re-edit of a file, with path tokens removed; gold = earlier edit rows of that path
//   decision  query = a later user prompt sharing >= 2 rare tokens with an AskUserQuestion answer; gold = that decision row
//
// Usage: node build-queries.mjs --projects /tmp/memory-retrieval-private/projects.json --out /tmp/memory-retrieval-private
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PROJECTS = JSON.parse(fs.readFileSync(arg("--projects", "/tmp/memory-retrieval-private/projects.json"), "utf8"));
const OUT = arg("--out", "/tmp/memory-retrieval-private");
const MIN_GAP = 30; // rows between gold and query, so the answer is not in the recent window

const text = (c) => typeof c === "string" ? c : Array.isArray(c) ? c.filter((x) => x.type === "text").map((x) => x.text).join("\n") : "";
const isNoise = (t) => !t || /^\s*<(local-command|command-|system-reminder|task-notification)/.test(t) || /^\[Request interrupted/.test(t);
const toolResultText = (c) => typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (x.type === "text" ? x.text : "")).join("\n") : "";
const decodeCmd = (cmd) => {
  const m = /CM_ORIG_B64='([A-Za-z0-9+/=]+)'/.exec(cmd || "");
  if (!m) return cmd || "";
  try { const j = JSON.parse(Buffer.from(m[1], "base64").toString("utf8")); return j.c || j.cmd || j.command || cmd; } catch { return cmd; }
};
const STOP = new Set("the a an and or to of in on for is it this that with be are was we you i me my do does did not no yes ok bu bir ve ile de da mi mı ne için ama gibi daha çok şu o var yok olsun olarak sen ben biz".split(" "));
const tokens = (s) => String(s).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 4 && !STOP.has(t));
const firstLine = (s) => String(s).split("\n").map((l) => l.trim()).find((l) => l.length >= 20) || "";
const normErr = (l) => l.replace(/\/[^\s:'"]+/g, "<p>").replace(/\b\d+\b/g, "<n>").slice(0, 160);

async function readSession(file, sessionId, rows, state) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  const pending = new Map();
  for await (const line of rl) {
    if (!line || line.length > 2_000_000) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    const c = r.message && r.message.content;
    if (r.type === "assistant" && Array.isArray(c)) for (const x of c) if (x.type === "tool_use") pending.set(x.id, x);
    if (r.type !== "user" || r.isMeta) continue;
    if (Array.isArray(c) && c.some((x) => x.type === "tool_result")) {
      for (const x of c) {
        if (x.type !== "tool_result") continue;
        const u = pending.get(x.tool_use_id); if (!u) continue;
        const inp = u.input || {}; const res = toolResultText(x.content);
        const seq = ++state.seq; const base = { seq, session: sessionId, turn: state.turn };
        if (u.name === "AskUserQuestion") {
          const qs = (inp.questions || []).map((q) => q.question).join(" | ");
          const tur = r.toolUseResult && r.toolUseResult.answers; const ans = tur ? Object.entries(tur).map(([k, v]) => `${k} = ${Array.isArray(v) ? v.join(" | ") : v}`).join("; ") : "";
          if (ans) { rows.push({ ...base, kind: "decision", body: `Q: ${qs} → A: ${ans}`.slice(0, 1200) }); continue; }
        }
        if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(u.name)) {
          rows.push({ ...base, kind: "edit", path: inp.file_path || inp.notebook_path || "", body: `${u.name} ${inp.file_path || ""} ${(inp.new_string || inp.content || "").slice(0, 300)}`, ok: !x.is_error });
        } else if (x.is_error) {
          rows.push({ ...base, kind: "toolerr", key: `${u.name}:${decodeCmd(inp.command) || JSON.stringify(inp).slice(0, 200)}`.slice(0, 400), body: res.slice(0, 600), ok: false });
        } else if (u.name === "Bash") {
          rows.push({ ...base, kind: "cmd", key: `Bash:${decodeCmd(inp.command)}`.slice(0, 400), body: decodeCmd(inp.command).slice(0, 400), ok: true });
        }
      }
    } else {
      const t = text(c);
      if (isNoise(t)) continue;
      state.turn++;
      rows.push({ seq: ++state.seq, session: sessionId, turn: state.turn, kind: "prompt", body: t.slice(0, 800) });
    }
  }
}

function buildQueries(pid, rows) {
  const q = []; const df = new Map();
  for (const r of rows) for (const t of new Set(tokens(r.body))) df.set(t, (df.get(t) || 0) + 1);
  const rare = (t) => (df.get(t) || 0) <= Math.max(3, rows.length * 0.002);

  // errorfix
  const seen = new Map();
  for (const r of rows) {
    if (r.kind !== "toolerr") continue;
    const line = firstLine(r.body); if (!line) continue;
    const k = normErr(line); const prev = (seen.get(k) || []).filter((p) => r.seq - p.seq >= MIN_GAP);
    if (prev.length && q.filter((x) => x.type === "errorfix").length < 25) q.push({ id: `${pid}-e${r.seq}`, type: "errorfix", session: r.session, askedAtSeq: r.seq, query: line.slice(0, 300), gold: prev.map((p) => p.seq) });
    (seen.get(k) || seen.set(k, []).get(k)).push(r);
  }
  // file
  const byPath = new Map(); let lastPrompt = null;
  for (const r of rows) {
    if (r.kind === "prompt") { lastPrompt = r; continue; }
    if (r.kind !== "edit" || !r.path) continue;
    const prev = (byPath.get(r.path) || []).filter((p) => p.session !== r.session && r.seq - p.seq >= MIN_GAP);
    if (prev.length && lastPrompt && lastPrompt.session === r.session && q.filter((x) => x.type === "file").length < 25) {
      const pathToks = new Set(tokens(r.path));
      const qt = tokens(lastPrompt.body).filter((t) => !pathToks.has(t));
      if (qt.length >= 3) q.push({ id: `${pid}-f${r.seq}`, type: "file", session: r.session, askedAtSeq: lastPrompt.seq, query: qt.slice(0, 40).join(" "), gold: prev.map((p) => p.seq) });
    }
    (byPath.get(r.path) || byPath.set(r.path, []).get(r.path)).push(r);
  }
  // decision
  const decisions = rows.filter((r) => r.kind === "decision");
  for (const d of decisions) {
    const dt = new Set(tokens(d.body).filter(rare)); if (dt.size < 2) continue;
    const later = rows.find((r) => r.kind === "prompt" && r.seq - d.seq >= MIN_GAP && tokens(r.body).filter((t) => dt.has(t)).length >= 2);
    if (later) q.push({ id: `${pid}-d${d.seq}`, type: "decision", session: later.session, askedAtSeq: later.seq, query: later.body.slice(0, 300), gold: [d.seq] });
  }
  return q;
}

fs.mkdirSync(path.join(OUT, "journal2"), { recursive: true });
fs.mkdirSync(path.join(OUT, "queries2"), { recursive: true });
const summary = [];
for (const p of PROJECTS) {
  const rows = []; const state = { seq: 0, turn: 0 };
  const files = fs.readdirSync(p.dir).filter((f) => f.endsWith(".jsonl")).map((f) => path.join(p.dir, f)).sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
  for (const f of files) await readSession(f, path.basename(f, ".jsonl"), rows, state);
  const q = buildQueries(p.id, rows);
  fs.writeFileSync(path.join(OUT, "journal2", `${p.id}.json`), JSON.stringify({ rows }));
  fs.writeFileSync(path.join(OUT, "queries2", `${p.id}.checked.json`), JSON.stringify(q));
  const c = (t) => q.filter((x) => x.type === t).length;
  summary.push(`${p.id} rows=${rows.length} decisions=${rows.filter((r) => r.kind === "decision").length} q: errorfix=${c("errorfix")} file=${c("file")} decision=${c("decision")}`);
}
console.log(summary.join("\n"));
