// e2e/harness/normalize.test.mjs
// Unit self-tests for normalize.mjs (DEVIATIONS D-M0-2/A4 context).
import test from "node:test";
import assert from "node:assert/strict";
import { normalize } from "./normalize.mjs";

test("replaces an ISO-8601 timestamp with <ts>", () => {
  const out = normalize({ at: "2026-10-17T12:00:00.000Z" });
  assert.equal(out.at, "<ts>");
});

test("replaces a <Key>Ms / <key>_ms number field with <ms>", () => {
  const out = normalize({ elapsedMs: 123, elapsed_ms: 45, other: 123 });
  assert.equal(out.elapsedMs, "<ms>");
  assert.equal(out.elapsed_ms, "<ms>");
  assert.equal(out.other, 123);
});

test("replaces the home and project path prefixes", () => {
  const out = normalize(
    { p: "/tmp/home/abc/file.txt", q: "/tmp/proj/xyz/file.txt" },
    { home: "/tmp/home/abc", proj: "/tmp/proj/xyz" }
  );
  assert.equal(out.p, "<home>/file.txt");
  assert.equal(out.q, "<proj>/file.txt");
});

test("replaces a pid occurrence with <pid>", () => {
  const out = normalize({ s: "pid 48213 exited" }, { pid: 48213 });
  assert.equal(out.s, "pid <pid> exited");
});

test("replaces a session id by first-appearance order, per call", () => {
  const sid1 = "11111111-1111-1111-1111-111111111111";
  const sid2 = "22222222-2222-2222-2222-222222222222";
  const out = normalize({ a: sid1, b: sid2, c: sid1 });
  assert.equal(out.a, "<sid:0>");
  assert.equal(out.b, "<sid:1>");
  assert.equal(out.c, "<sid:0>");
});

test("converts backslashes to forward slashes", () => {
  const out = normalize({ p: "C:\\Users\\a\\file.txt" });
  assert.equal(out.p, "C:/Users/a/file.txt");
});

test("never throws on an unrecognized shape and passes it through", () => {
  const circular = {};
  circular.self = circular;
  assert.doesNotThrow(() => normalize(circular));
});

test("never mutates the input", () => {
  const input = { at: "2026-10-17T12:00:00.000Z", nested: { v: 1 } };
  const snapshot = JSON.parse(JSON.stringify(input));
  normalize(input);
  assert.deepEqual(input, snapshot);
});

test("walks arrays and nested objects", () => {
  const out = normalize({ list: [{ at: "2026-10-17T00:00:00Z" }, { at: "2026-10-18T00:00:00Z" }] });
  assert.equal(out.list[0].at, "<ts>");
  assert.equal(out.list[1].at, "<ts>");
});

test("passes through null, undefined and booleans unchanged", () => {
  const out = normalize({ a: null, b: undefined, c: true, d: false });
  assert.equal(out.a, null);
  assert.equal(out.b, undefined);
  assert.equal(out.c, true);
  assert.equal(out.d, false);
});
