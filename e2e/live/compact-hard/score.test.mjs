import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAnswer, isCorrect } from "./score.mjs";
import { mainSessions } from "./sessions.mjs";
import { heldoutSessions } from "./heldout/sessions.mjs";

test("parseAnswer takes the last ANSWER line", () => {
  assert.equal(parseAnswer("a\nANSWER: 1\nmore\nANSWER: `42`\n"), "42");
  assert.equal(parseAnswer("**ANSWER: x@y**"), "x@y");
  assert.equal(parseAnswer("the answer is 42"), null);
});
test("isCorrect is exact", () => {
  assert.equal(isCorrect("ANSWER: 7350", "7350"), true);
  assert.equal(isCorrect("ANSWER: 7350 ms", "7350"), false);
  assert.equal(isCorrect("ANSWER: 735", "7350"), false);
});
test("fixtures are deterministic and sized as stated", () => {
  const a = mainSessions(), b = mainSessions();
  assert.equal(a.length, 4);
  assert.equal(a.reduce((n, s) => n + s.questions.length, 0), 12);
  for (let i = 0; i < a.length; i++) assert.equal(a[i].data.text, b[i].data.text);
  for (const s of a) for (const q of s.questions) if (!q.derived) assert.ok(s.data.text.includes(q.answer), q.id);
  const z = a.find((s) => s.id === "cfg");
  const [svc, reg] = z.questions.find((q) => q.derived).answer.split("@");
  const doc = JSON.parse(z.data.text);
  assert.equal(doc.regions[reg].services[svc].replicas, 0);
  let zeros = 0;
  for (const r of Object.values(doc.regions)) for (const x of Object.values(r.services)) if (x.replicas === 0) zeros++;
  assert.equal(zeros, 1);
  assert.equal(heldoutSessions().reduce((n, s) => n + s.questions.length, 0), 6);
  for (const s of heldoutSessions()) for (const q of s.questions) assert.ok(s.data.text.includes(q.answer), q.id);
});
