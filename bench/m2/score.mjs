// Pure parts of the M2 eval (bench/m2/eval.mjs): transcript parsing and oracle-gated scoring. No I/O.

// One stream-json transcript -> per-tool bytes of tool_result content the model saw, hook additionalContext
// bytes, the result event. Bytes are UTF-8 bytes of text blocks, the same count as bench/saving-score.mjs.
export function parseTranscript(text) {
  const names = new Map(), seen = new Set(), perTool = {};
  let res = null, hookBytes = 0, calls = 0;
  for (const l of String(text).split("\n")) {
    if (!l.startsWith("{")) continue;
    let ev; try { ev = JSON.parse(l); } catch { continue; }
    if (ev.type === "result") res = ev;
    if (ev.type === "system" && ev.subtype === "hook_response") hookBytes += additionalContextBytes(ev.stdout ?? ev.output);
    const content = ev.message?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (ev.type === "assistant" && c.type === "tool_use") { calls++; names.set(c.id, toolKey(c.name)); }
      if (ev.type === "user" && c.type === "tool_result" && !seen.has(c.tool_use_id)) {
        seen.add(c.tool_use_id);
        const k = names.get(c.tool_use_id) ?? "unknown";
        const t = (perTool[k] ??= { calls: 0, bytes: 0 });
        t.calls++; t.bytes += resultBytes(c.content);
      }
    }
  }
  const bytes = Object.values(perTool).reduce((s, t) => s + t.bytes, 0);
  return { bytes, perTool, hookBytes, calls, res };
}

// ctx tools keep their own name; any other MCP tool is grouped as "mcp:other" (the bucket name of bench/replay.mjs).
export function toolKey(name) {
  const n = String(name);
  if (n.startsWith("mcp__plugin_context-mode_context-mode__")) return n.slice("mcp__plugin_context-mode_context-mode__".length);
  return n.startsWith("mcp__") ? "mcp:other" : n;
}

export function resultBytes(content) {
  if (typeof content === "string") return Buffer.byteLength(content, "utf8");
  let b = 0;
  if (Array.isArray(content)) for (const x of content) if (x && x.type === "text" && typeof x.text === "string") b += Buffer.byteLength(x.text, "utf8");
  return b;
}

export function additionalContextBytes(raw) {
  let j;
  try { j = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return 0; }
  const c = j?.hookSpecificOutput?.additionalContext ?? j?.additionalContext;
  return typeof c === "string" ? Buffer.byteLength(c, "utf8") : 0;
}

export const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const round = (x) => (x === null || Number.isNaN(x) ? null : +x.toFixed(2));

// Oracle: the final answer holds every expected string ("1,234" read as "1234").
export function oracle(resultEvent, expect) {
  if (!resultEvent || resultEvent.is_error === true) return false;
  const text = normalizeNumbers(String(resultEvent.result ?? ""));
  return expect.every((e) => text.includes(e));
}
// Drops a comma between digit groups (1,234 -> 1234) with a scan, no pattern engine.
export function normalizeNumbers(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const isDigit = (c) => c >= "0" && c <= "9";
    if (s[i] === "," && i > 0 && isDigit(s[i - 1]) && isDigit(s[i + 1] ?? "") && isDigit(s[i + 2] ?? "") && isDigit(s[i + 3] ?? "") && !isDigit(s[i + 4] ?? "")) continue;
    out += s[i];
  }
  return out;
}

// rows: [{ task, arm: "off"|"v2", ok, bytes }]. Per workload the off reference is the median bytes of the off runs
// that pass the oracle. A v2 run counts its saving only when it passes the oracle; a failed v2 run counts
// min(0, saving): a failed task never adds saving. Workload saving = median of its v2 run savings.
// A workload with no passing off run is invalid (null) and left out of the median. Score = median over workloads.
export function scoreRows(rows, taskIds) {
  const perTask = taskIds.map((id) => {
    const off = rows.filter((x) => x.task === id && x.arm === "off"), v2 = rows.filter((x) => x.task === id && x.arm === "v2");
    const offRef = median(off.filter((x) => x.ok).map((x) => x.bytes));
    const runs = offRef ? v2.map((x) => { const s = (100 * (offRef - x.bytes)) / offRef; return x.ok ? s : Math.min(0, s); }) : [];
    return { task: id, offBytes: offRef, v2Bytes: median(v2.map((x) => x.bytes)), savingPct: runs.length ? round(median(runs)) : null,
      passOff: off.filter((x) => x.ok).length, passV2: v2.filter((x) => x.ok).length, runs: v2.length };
  });
  const valid = perTask.filter((x) => x.savingPct !== null);
  return { score: valid.length ? round(median(valid.map((x) => x.savingPct))) : null, perTask, invalid: perTask.filter((x) => x.savingPct === null).map((x) => x.task) };
}
