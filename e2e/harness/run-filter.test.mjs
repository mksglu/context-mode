// e2e/harness/run-filter.test.mjs
// Unit self-tests for the --milestone tag filter in e2e/cases/run.mjs
// (DEVIATIONS D-M0-2).
import test from "node:test";
import assert from "node:assert/strict";
import { milestoneAtOrBelow } from "../cases/run.mjs";

test("a [M0] test is included under --milestone M0", () => {
  assert.equal(milestoneAtOrBelow("[M0] install handshake", "M0"), true);
});

test("a [M2] test is excluded under --milestone M0", () => {
  assert.equal(milestoneAtOrBelow("[M2] scope test", "M0"), false);
});

test("a [M1] test is included under --milestone M2", () => {
  assert.equal(milestoneAtOrBelow("[M1] hooks test", "M2"), true);
});

test("a test with no [Mn] tag is excluded under any milestone", () => {
  assert.equal(milestoneAtOrBelow("untagged test", "M0"), false);
});

test("an unparsable milestone argument excludes every test", () => {
  assert.equal(milestoneAtOrBelow("[M0] install handshake", "bogus"), false);
});
