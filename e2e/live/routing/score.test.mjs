import test from "node:test";
import assert from "node:assert/strict";
import { ROUTE_BYTES, classOf, toolClass, resultBytes, parseTranscript, scoreRun, scoreOldRule, tally } from "./score.mjs";
import { buildTasks } from "./tasks.mjs";

const CTX = "mcp__plugin_context-mode_context-mode__ctx_execute";

test("ROUTE_BYTES is 2048", () => assert.equal(ROUTE_BYTES, 2048));

test("classOf: boundary 2048 small, 2049 large, multi-byte counted in UTF-8", () => {
  assert.equal(classOf({ a: "x".repeat(2048) }), "small");
  assert.equal(classOf({ a: "x".repeat(2049) }), "large");
  assert.equal(classOf({ a: "x".repeat(1000), b: "y".repeat(1049) }), "large");
  assert.equal(classOf({ a: "é".repeat(1025) }), "large"); // 2050 bytes, 1025 chars
  assert.equal(classOf({}), "small");
});

test("classOf matches the declared size of every task", () => {
  for (const t of buildTasks()) {
    const want = t.size === "t4" ? "large" : t.size;
    assert.equal(classOf(t.files), want, t.id);
  }
});

test("toolClass: ctx_ in name is ctx, else native", () => {
  assert.equal(toolClass(CTX), "ctx");
  assert.equal(toolClass("mcp__plugin_context_mode_context_mode__ctx_search"), "ctx");
  assert.equal(toolClass("Bash"), "native");
  assert.equal(toolClass("ToolSearch"), "native");
});

test("resultBytes: string, text blocks, non-text blocks, null, other", () => {
  assert.equal(resultBytes("héllo"), 6);
  assert.equal(resultBytes([{ type: "text", text: "ab" }, { type: "text", text: "cé" }]), 5);
  const img = { type: "image", source: { data: "zz" } };
  assert.equal(resultBytes([{ type: "text", text: "ab" }, img]), 2 + JSON.stringify(img).length);
  assert.equal(resultBytes(null), 0);
  assert.equal(resultBytes(undefined), 0);
  assert.equal(resultBytes({ a: 1 }), 7);
});

test("parseTranscript: orders calls, sums bytes, reads final and cost, skips junk", () => {
  const L = (o) => JSON.stringify(o);
  const out = [
    "not json", "{broken",
    L({ type: "assistant", message: { content: [{ type: "tool_use", id: "1", name: "Bash" }, { type: "text", text: "x" }] } }),
    L({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "1", content: "12345" }, { type: "tool_result", tool_use_id: "ghost", content: "zz" }] } }),
    L({ type: "assistant", message: { content: [{ type: "tool_use", id: "2", name: CTX }] } }),
    L({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "2", content: [{ type: "text", text: "abc" }], is_error: true }] } }),
    L({ type: "assistant" }), L({ type: "user" }),
    L({ type: "result", result: "42", total_cost_usd: 0.5 }),
  ].join("\n");
  const p = parseTranscript(out);
  assert.deepEqual(p.calls.map((c) => [c.name, c.bytes, c.err]), [["Bash", 5, false], [CTX, 3, true]]);
  assert.equal(p.final, "42"); assert.equal(p.cost, 0.5);
  assert.deepEqual(parseTranscript(""), { calls: [], final: "", cost: 0 });
});

test("large: native bytes exactly 2048 is not under-routed, 2049 is", () => {
  assert.equal(scoreRun({ cls: "large", calls: [{ name: "Bash", bytes: 2048 }], correct: true }).underRouted, false);
  assert.equal(scoreRun({ cls: "large", calls: [{ name: "Bash", bytes: 2049 }], correct: true }).underRouted, true);
});

test("large: filtered native command with few bytes is not under-routing", () => {
  const r = scoreRun({ cls: "large", calls: [{ name: "Bash", bytes: 8 }], correct: true });
  assert.equal(r.underRouted, false); assert.equal(r.firstTool, "Bash"); assert.equal(r.nativeBytes, 8);
});

test("large: native bytes add up over calls; ctx bytes are not counted as native", () => {
  const r = scoreRun({ cls: "large", calls: [{ name: "Bash", bytes: 1500 }, { name: "Read", bytes: 600 }, { name: CTX, bytes: 99999 }], correct: true });
  assert.equal(r.nativeBytes, 2100); assert.equal(r.ctxBytes, 99999); assert.equal(r.underRouted, true);
  const r2 = scoreRun({ cls: "large", calls: [{ name: CTX, bytes: 99999 }], correct: true });
  assert.equal(r2.underRouted, false); assert.equal(r2.nativeBytes, 0);
});

test("small: any ctx call is over-routed, even after a native call", () => {
  assert.equal(scoreRun({ cls: "small", calls: [{ name: CTX, bytes: 1 }], correct: true }).overRouted, true);
  assert.equal(scoreRun({ cls: "small", calls: [{ name: "Bash", bytes: 1 }, { name: CTX, bytes: 1 }], correct: true }).overRouted, true);
  assert.equal(scoreRun({ cls: "small", calls: [{ name: "Bash", bytes: 5000 }], correct: true }).overRouted, false);
});

test("class gates the flags: small never under, large never over", () => {
  const big = scoreRun({ cls: "small", calls: [{ name: "Bash", bytes: 99999 }], correct: false });
  assert.equal(big.underRouted, false);
  const lg = scoreRun({ cls: "large", calls: [{ name: CTX, bytes: 1 }], correct: true });
  assert.equal(lg.overRouted, false);
});

test("firstTool skips ToolSearch; no calls gives (none); correct is boolean", () => {
  assert.equal(scoreRun({ cls: "small", calls: [{ name: "ToolSearch", bytes: 3 }, { name: "Bash", bytes: 1 }], correct: 1 }).firstTool, "Bash");
  const e = scoreRun({ cls: "large", calls: [], correct: undefined });
  assert.equal(e.firstTool, "(none)"); assert.equal(e.correct, false); assert.equal(e.underRouted, false);
  assert.equal(scoreRun({ cls: "small", calls: [{ name: "ToolSearch", bytes: 3 }], correct: true }).firstTool, "(none)");
});

test("ToolSearch counts as a native call by the name rule", () => {
  const r = scoreRun({ cls: "large", calls: [{ name: "ToolSearch", bytes: 3000 }, { name: CTX, bytes: 5 }], correct: true });
  assert.equal(r.nativeBytes, 3000); assert.equal(r.underRouted, true);
});

test("scoreOldRule: first tool decides", () => {
  assert.deepEqual(scoreOldRule({ cls: "large", firstTool: "Bash" }), { underRouted: true, overRouted: false });
  assert.deepEqual(scoreOldRule({ cls: "large", firstTool: CTX }), { underRouted: false, overRouted: false });
  assert.deepEqual(scoreOldRule({ cls: "large", firstTool: "(none)" }), { underRouted: true, overRouted: false });
  assert.deepEqual(scoreOldRule({ cls: "small", firstTool: CTX }), { underRouted: false, overRouted: true });
  assert.deepEqual(scoreOldRule({ cls: "small", firstTool: "Bash" }), { underRouted: false, overRouted: false });
});

test("tally: per model counts, T4 rows ignored, limit 2 passes, 3 fails", () => {
  const row = (m, cls, u, o, c) => ({ model: m, class: cls, underRouted: u, overRouted: o, correct: c });
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push(row("a", "large", i < 2, false, true), row("a", "small", false, i < 2, i !== 0));
  for (let i = 0; i < 20; i++) rows.push(row("b", "large", i < 3, false, true), row("b", "small", false, false, true));
  rows.push({ model: "a", class: "t4", underRouted: true, overRouted: true, correct: false });
  const t = tally(rows);
  assert.deepEqual(t.a, { runsLarge: 20, runsSmall: 20, under: 2, over: 2, correct: 39, correctLarge: 20, correctSmall: 19, pass: true });
  assert.equal(t.b.under, 3); assert.equal(t.b.pass, false);
  const o = tally([row("c", "small", false, true, true), row("c", "small", false, true, true), row("c", "small", false, true, true)]);
  assert.equal(o.c.over, 3); assert.equal(o.c.pass, false);
});
