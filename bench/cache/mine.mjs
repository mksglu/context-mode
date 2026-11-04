#!/usr/bin/env node
// Mines raw Claude Code stream-json transcripts for prompt-cache behaviour. Pure parsing, no spend, no network.
// Usage: node bench/cache/mine.mjs <raw-root> [--out mined.json] [--table mined.md]
//
// Break rule (task definition): cache_creation at turn n is larger than the new content since turn n-1 by more
// than 1024 tokens, i.e. part of the old prefix was written again. Usage does not report the new content, so the
// old prefix that was not read back is measured directly: rewritten = (cc + cr at n-1) - cr at n, floored at 0.
// A turn that wrote its old prefix again reads less than the old prefix back; new content only adds to cc.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const BREAK_TOKENS = 1024;

export function parseSession(text) {
  const byId = new Map();
  const turns = [];
  let version = null, model = null, sawInit = false, pending = null;
  for (const raw of text.split("\n")) {
    if (!raw) continue;
    let e;
    try { e = JSON.parse(raw); } catch { continue; }
    if (!e || typeof e !== "object") continue;
    if (e.type === "system" && e.subtype === "init") {
      version ??= e.claude_code_version ?? null;
      model ??= e.model ?? null;
      if (sawInit && pending !== "compact") pending = "resume";
      sawInit = true;
    } else if (e.type === "system" && e.subtype === "compact_boundary") {
      pending = "compact";
    } else if (e.type === "assistant" && e.message?.usage && !e.parent_tool_use_id) {
      const u = e.message.usage;
      const id = e.message.id ?? `u${turns.length}`;
      if (!(u.input_tokens || u.cache_creation_input_tokens || u.cache_read_input_tokens)) continue; // synthetic message, no API call
      const row = { id, in: u.input_tokens ?? 0, cc: u.cache_creation_input_tokens ?? 0, cr: u.cache_read_input_tokens ?? 0, out: u.output_tokens ?? 0 };
      const seen = byId.get(id);
      if (seen) { Object.assign(seen, row, { kind: seen.kind }); continue; }
      row.kind = turns.length === 0 ? "first" : (pending ?? "normal");
      pending = null;
      byId.set(id, row);
      turns.push(row);
    }
  }
  return { version, model, turns };
}

export function analyzeSession(s) {
  const turns = s.turns.map((t, i) => {
    const prev = s.turns[i - 1];
    const total = t.in + t.cc + t.cr;
    const hit = total === 0 ? null : t.cr / total;
    const rewritten = prev ? Math.max(0, prev.cc + prev.cr - t.cr) : 0;
    const isBreak = !!prev && t.kind !== "compact" && rewritten > BREAK_TOKENS;
    return { ...t, total, hit, rewritten, break: isBreak };
  });
  return { version: s.version, model: s.model, turns };
}

export function percentile(xs, p) {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.ceil(p * a.length) - 1))];
}

export function armOf(file) {
  const tok = path.basename(file).toLowerCase().split(/[-_.]/);
  for (const [t, arm] of [["v2", "v2"], ["v1", "v1"], ["gateway", "gateway"], ["direct", "off"], ["off", "off"], ["plain", "off"]]) if (tok.includes(t)) return arm;
  return "unknown";
}

export function workloadOf(file) {
  const dir = path.dirname(file).split("/").filter((x) => x && x !== ".");
  return dir.slice(0, 2).join("/") || "root";
}

const ratio = (num, den) => (den === 0 ? null : num / den);

function stats(sessions) {
  const normal = [], compact = [], sessHit = [];
  let turns = 0, breaks = 0, resumes = 0;
  for (const s of sessions) {
    let cr = 0, all = 0;
    for (const t of s.turns) {
      if (t.kind === "compact") { compact.push(t); continue; }
      turns++;
      if (t.kind === "resume") resumes++;
      if (t.break) breaks++;
      if (t.hit !== null) normal.push(t.hit);
      cr += t.cr; all += t.total;
    }
    const h = ratio(cr, all);
    if (h !== null) sessHit.push(h);
  }
  const ch = compact.map((t) => t.hit).filter((x) => x !== null);
  return {
    sessions: sessions.length, turns, resumeTurns: resumes, breaks,
    breakRate: ratio(breaks, Math.max(0, turns - sessions.length)),
    hitTurn: { median: percentile(normal, 0.5), p90: percentile(normal, 0.9) },
    hitSession: { median: percentile(sessHit, 0.5), p90: percentile(sessHit, 0.9) },
    compactTurns: { count: compact.length, hitMedian: percentile(ch, 0.5), rewrittenMedian: percentile(compact.map((t) => t.rewritten), 0.5) },
  };
}

export function summarize(items) {
  const arms = {};
  for (const { path: p, session } of items) {
    if (!session.turns.length) continue;
    const a = (arms[armOf(p)] ??= { all: [], by: {}, breakList: [] });
    a.all.push(session);
    (a.by[workloadOf(p)] ??= []).push(session);
    session.turns.forEach((t, i) => { if (t.break) a.breakList.push({ path: p, turn: i + 1, rewritten: t.rewritten }); });
  }
  const out = { definition: { breakTokens: BREAK_TOKENS, rule: "rewritten = (cc+cr at n-1) - cr at n; break when > 1024; compact turns counted apart" }, arms: {} };
  for (const [k, a] of Object.entries(arms)) {
    out.arms[k] = { total: stats(a.all), byWorkload: Object.fromEntries(Object.entries(a.by).sort().map(([w, ss]) => [w, stats(ss)])), breakList: a.breakList };
  }
  return out;
}

function walk(dir, acc = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, acc);
    else if (d.name.endsWith(".jsonl")) acc.push(p);
  }
  return acc;
}

export function mineDir(root) {
  const seen = new Set(), items = [], versions = {};
  let files = 0, dup = 0;
  for (const f of walk(root).sort()) {
    const text = fs.readFileSync(f, "utf8");
    if (!text.includes('"cache_creation_input_tokens"')) continue;
    const h = crypto.createHash("sha1").update(text).digest("hex");
    if (seen.has(h)) { dup++; continue; }
    seen.add(h);
    const session = analyzeSession(parseSession(text));
    if (!session.turns.length) continue;
    files++;
    versions[session.version ?? "unknown"] = (versions[session.version ?? "unknown"] ?? 0) + 1;
    items.push({ path: path.relative(root, f), session });
  }
  return { items, files, duplicatesSkipped: dup, versions };
}

const pct = (x) => (x === null ? "-" : (x * 100).toFixed(1) + "%");

export function table(out) {
  const L = ["| arm | workload | sessions | turns | breaks | hit/turn med | hit/turn p90 | hit/session med | hit/session p90 | compact turns | compact hit med |", "|---|---|---|---|---|---|---|---|---|---|---|"];
  const row = (arm, w, s) => L.push(`| ${arm} | ${w} | ${s.sessions} | ${s.turns} | ${s.breaks} | ${pct(s.hitTurn.median)} | ${pct(s.hitTurn.p90)} | ${pct(s.hitSession.median)} | ${pct(s.hitSession.p90)} | ${s.compactTurns.count} | ${pct(s.compactTurns.hitMedian)} |`);
  for (const [arm, a] of Object.entries(out.arms)) {
    row(arm, "TOTAL", a.total);
    for (const [w, s] of Object.entries(a.byWorkload)) row(arm, w, s);
  }
  return L.join("\n") + "\n";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
  const root = args[0];
  if (!root) { console.error("usage: mine.mjs <raw-root> [--out f.json] [--table f.md]"); process.exit(2); }
  const m = mineDir(root);
  const out = { ...summarize(m.items), source: { files: m.files, duplicatesSkipped: m.duplicatesSkipped, claudeCodeVersions: m.versions } };
  if (opt("--out")) fs.writeFileSync(opt("--out"), JSON.stringify(out, null, 2) + "\n");
  const t = table(out);
  if (opt("--table")) fs.writeFileSync(opt("--table"), t);
  process.stdout.write(t);
}
