// GP-LIVE-ROUTING scorer: pure functions, no I/O, no model calls (owner decision 2026-10-19).
// It looks at the tool the model chose AND the bytes that came back.
// e2e may not import src/, so the limit is repeated here. Source: TECH-SPEC section 6.5 and ADR-0008
// (a native output larger than 2048 bytes must go through a ctx tool).
export const ROUTE_BYTES = 2048;

const utf8 = (s) => Buffer.byteLength(s, "utf8");

// Step 2: the class comes from the fixture only, never from a model run.
// "Full native output" = all fixture file bytes (what `cat` of every file would print).
export function classOf(files) {
  let total = 0;
  for (const c of Object.values(files)) total += utf8(c);
  return total > ROUTE_BYTES ? "large" : "small";
}

// Step 3: tool class by name.
export const toolClass = (name) => (String(name).includes("ctx_") ? "ctx" : "native");

// Step 3: bytes of a stored tool_result content value.
// string -> its UTF-8 length; array -> text blocks joined, other blocks counted by JSON length.
export function resultBytes(content) {
  if (content == null) return 0;
  if (typeof content === "string") return utf8(content);
  if (Array.isArray(content)) {
    let text = "", other = 0;
    for (const b of content) {
      if (b && b.type === "text" && typeof b.text === "string") text += b.text;
      else other += utf8(JSON.stringify(b));
    }
    return utf8(text) + other;
  }
  return utf8(JSON.stringify(content));
}

// Read a claude stream-json transcript into ordered calls [{name, bytes}] plus the final reply.
export function parseTranscript(stdout) {
  const order = [], byId = new Map(); let final = "", cost = 0;
  for (const l of String(stdout).split("\n")) {
    if (!l.startsWith("{")) continue;
    let o; try { o = JSON.parse(l); } catch { continue; }
    if (o.type === "assistant") for (const b of o.message?.content ?? []) if (b.type === "tool_use") { const c = { id: b.id, name: b.name, bytes: 0, err: false, text: "" }; order.push(c); byId.set(b.id, c); }
    if (o.type === "user") for (const b of o.message?.content ?? []) if (b.type === "tool_result") {
      const c = byId.get(b.tool_use_id); if (!c) continue;
      c.bytes += resultBytes(b.content); c.err = !!b.is_error;
      c.text = typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? "");
    }
    if (o.type === "result") { final = String(o.result ?? ""); cost = Number(o.total_cost_usd || 0); }
  }
  return { calls: order, final, cost };
}

// Steps 3-6. cls: "large" | "small". calls: [{name, bytes}] in order. correct: boolean.
export function scoreRun({ cls, calls, correct }) {
  let nativeBytes = 0, ctxBytes = 0, ctxCalls = 0;
  for (const c of calls) {
    if (toolClass(c.name) === "ctx") { ctxBytes += c.bytes; ctxCalls++; } else nativeBytes += c.bytes;
  }
  const firstTool = calls.find((c) => c.name !== "ToolSearch")?.name ?? "(none)";
  return {
    class: cls, firstTool, nativeBytes, ctxBytes,
    underRouted: cls === "large" && nativeBytes > ROUTE_BYTES,
    overRouted: cls === "small" && ctxCalls > 0,
    correct: !!correct,
  };
}

// Old rule (kept only to compare): the first non-ToolSearch tool decides.
export function scoreOldRule({ cls, firstTool }) {
  const ctx = firstTool !== "(none)" && toolClass(firstTool) === "ctx";
  return { underRouted: cls === "large" && !ctx, overRouted: cls === "small" && ctx };
}

// Pass limits per model, out of 20 runs: under <= 2, over <= 2 (unchanged).
export const LIMIT = 2;
export function tally(rows) {
  const out = {};
  for (const m of [...new Set(rows.map((r) => r.model))]) {
    const R = rows.filter((r) => r.model === m && (r.class === "large" || r.class === "small"));
    const lg = R.filter((r) => r.class === "large"), sm = R.filter((r) => r.class === "small");
    const under = lg.filter((r) => r.underRouted).length, over = sm.filter((r) => r.overRouted).length;
    const correct = R.filter((r) => r.correct).length;
    out[m] = { runsLarge: lg.length, runsSmall: sm.length, under, over, correct, correctLarge: lg.filter((r) => r.correct).length, correctSmall: sm.filter((r) => r.correct).length, pass: under <= LIMIT && over <= LIMIT };
  }
  return out;
}
