// e2e/live/cache/analyze.test.mjs
// Unit self-tests for analyze.mjs (cache-break counting over claude -p stream-json usage). No model, no network.
import test from "node:test";
import assert from "node:assert/strict";
import { BREAK_TOKENS, parseTurn, analyzeSession, crossSession, promptTokens } from "./analyze.mjs";

const asst = (id, u, extra = {}) => JSON.stringify({ type: "assistant", session_id: "s1", ...extra,
  message: { id, content: [{ type: "text", text: "x" }], usage: { input_tokens: u[0], cache_read_input_tokens: u[1], cache_creation_input_tokens: u[2], output_tokens: u[3] } } });
const result = (cost = 0.01) => JSON.stringify({ type: "result", session_id: "s1", is_error: false, total_cost_usd: cost, result: "ok" });
const stream = (...lines) => lines.join("\n") + "\n";

test("BREAK_TOKENS is the owner threshold", () => { assert.equal(BREAK_TOKENS, 1024); });

test("promptTokens sums input, cache read and cache creation", () => {
  assert.equal(promptTokens({ input: 2, cacheRead: 10, cacheCreation: 5, output: 99 }), 17);
});

test("parseTurn merges the content-block records of one message id into one call", () => {
  const t = parseTurn(stream(asst("m1", [2, 100, 50, 4]), asst("m1", [2, 100, 50, 4]), asst("m2", [1, 150, 10, 3]), result()));
  assert.equal(t.calls.length, 2);
  assert.deepEqual(t.calls[0], { id: "m1", input: 2, cacheRead: 100, cacheCreation: 50, output: 4, afterCompact: false });
  assert.equal(t.sessionId, "s1");
  assert.equal(t.costUsd, 0.01);
});

test("parseTurn ignores sub-agent messages (parent_tool_use_id set) and reports their count", () => {
  const t = parseTurn(stream(asst("m1", [1, 1, 1, 1]), asst("sub", [9, 9, 9, 9], { parent_tool_use_id: "tu1" }), result()));
  assert.equal(t.calls.length, 1);
  assert.equal(t.subagentCalls, 1);
});

test("parseTurn marks the first call after a compact boundary", () => {
  const boundary = JSON.stringify({ type: "system", subtype: "compact_boundary", session_id: "s1" });
  const t = parseTurn(stream(asst("m1", [1, 1000, 1, 1]), boundary, asst("m2", [1, 10, 500, 1]), asst("m3", [1, 510, 20, 1]), result()));
  assert.deepEqual(t.calls.map((c) => c.afterCompact), [false, true, false]);
  assert.equal(t.compacted, true);
});

const turn = (...calls) => ({ calls: calls.map((u, i) => ({ id: `m${i}`, input: u[0], cacheRead: u[1], cacheCreation: u[2], output: u[3], afterCompact: u[4] === true })) });

test("analyzeSession: no break when the whole old prefix is read and only new content is written", () => {
  const r = analyzeSession([turn([2, 0, 10000, 5]), turn([2, 10000, 2000, 5])]);
  assert.deepEqual(r.breaks, []);
});

test("analyzeSession: a break is an old prefix part written again by more than 1024 tokens", () => {
  const r = analyzeSession([turn([2, 0, 10000, 5]), turn([2, 10000, 2000, 5]), turn([2, 3000, 11000, 5])]);
  assert.equal(r.breaks.length, 1);
  assert.deepEqual({ turn: r.breaks[0].turn, call: r.breaks[0].call, rewritten: r.breaks[0].rewritten }, { turn: 2, call: 0, rewritten: 9002 });
});

test("analyzeSession: exactly 1024 re-written tokens is not a break, 1025 is", () => {
  const a = analyzeSession([turn([0, 0, 5000, 0]), turn([0, 5000 - 1024, 1024, 0])]);
  const b = analyzeSession([turn([0, 0, 5000, 0]), turn([0, 5000 - 1025, 1025, 0])]);
  assert.equal(a.breaks.length, 0);
  assert.equal(b.breaks.length, 1);
});

test("analyzeSession: the first call after a compact boundary is exempt and listed apart", () => {
  const r = analyzeSession([turn([0, 0, 9000, 0]), turn([0, 100, 700, 0, true], [0, 800, 40, 0])]);
  assert.deepEqual(r.breaks, []);
  assert.equal(r.postCompact.length, 1);
  assert.equal(r.postCompact[0].rewritten, 8900);
});

test("analyzeSession: hit ratio per turn is cache_read over read plus creation plus input", () => {
  const r = analyzeSession([turn([0, 0, 1000, 0]), turn([0, 750, 250, 0])]);
  assert.equal(r.perTurn[0].hitRatio, 0);
  assert.equal(r.perTurn[1].hitRatio, 0.75);
  assert.equal(r.firstPrefix, 1000);
});

test("crossSession: second session turn-1 read as a share of the first session turn-1 prefix", () => {
  const a = turn([2, 0, 16000, 5]);
  const b = turn([2, 14400, 1600, 5]);
  const r = crossSession(a, b);
  assert.equal(r.aPrefix, 16002);
  assert.equal(r.bRead, 14400);
  assert.equal(Number(r.share.toFixed(4)), 0.8999);
});

test("parseTurn lists the tool names the model called, in order, and the mcp server states of init", () => {
  const init = JSON.stringify({ type: "system", subtype: "init", session_id: "s1", mcp_servers: [{ name: "context-mode", status: "connected" }] });
  const tu = (id, name) => JSON.stringify({ type: "assistant", session_id: "s1", message: { id, content: [{ type: "tool_use", id: "t" + id, name, input: {} }], usage: { input_tokens: 1, cache_read_input_tokens: 1, cache_creation_input_tokens: 1, output_tokens: 1 } } });
  const t = parseTurn(stream(init, tu("m1", "Bash"), tu("m2", "Read"), result()));
  assert.deepEqual(t.tools, ["Bash", "Read"]);
  assert.deepEqual(t.mcp, ["context-mode:connected"]);
});

// ---- verdict: the owner pass rule over two arms ----
import { verdict } from "./analyze.mjs";
const sess = (turnsRatios, breaks = 0) => ({ breaks: Array.from({ length: breaks }, () => ({})), perTurn: turnsRatios.map((r, i) => ({ turn: i, input: 0, cacheRead: Math.round(r * 1000), cacheCreation: 1000 - Math.round(r * 1000), hitRatio: r })), firstPrefix: 1000 });
const arm = (ratios, breaks, shares) => ({ sessions: [sess(ratios, breaks), sess(ratios, breaks)], cross: shares.map((s) => ({ share: s })) });

test("verdict: pass when v2 has no more breaks, ratio within 2 points on turns 2-6, cross share >= 0.9", () => {
  const v = verdict(arm([0, 0.9, 0.9, 0.9, 0.9, 0.9], 1, [0.95]), arm([0, 0.89, 0.9, 0.9, 0.9, 0.9], 1, [0.93, 0.91]));
  assert.equal(v.pass, true);
});

test("verdict: more v2 breaks fail", () => {
  const v = verdict(arm([0, 0.9, 0.9, 0.9, 0.9, 0.9], 0, [1]), arm([0, 0.9, 0.9, 0.9, 0.9, 0.9], 1, [1]));
  assert.equal(v.breaksOk, false);
  assert.equal(v.pass, false);
});

test("verdict: a pooled hit ratio more than 2 points under off fails", () => {
  const v = verdict(arm([0, 0.9, 0.9, 0.9, 0.9, 0.9], 0, [1]), arm([0, 0.87, 0.87, 0.87, 0.87, 0.87], 0, [1]));
  assert.equal(v.hitOk, false);
});

test("verdict: the worst cross-session share under 0.9 fails; turn 1 is not in the hit ratio", () => {
  const v = verdict(arm([0, 0.9, 0.9, 0.9, 0.9, 0.9], 0, [1]), arm([0.5, 0.9, 0.9, 0.9, 0.9, 0.9], 0, [0.95, 0.89]));
  assert.equal(v.hitOk, true);
  assert.equal(v.crossOk, false);
  assert.equal(v.pass, false);
});

test("analyzeSession: a compact turn with no model call still exempts the first call of the next turn", () => {
  const compactTurn = { calls: [], compacted: true };
  const r = analyzeSession([turn([0, 0, 9000, 0]), compactTurn, turn([0, 4000, 5000, 0], [0, 9000, 40, 0])]);
  assert.deepEqual(r.breaks, []);
  assert.equal(r.postCompact.length, 1);
});
