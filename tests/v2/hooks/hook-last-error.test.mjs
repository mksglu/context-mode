// tests/v2/hooks/hook-last-error.test.mjs
// D-HNE-GUARD-1: ctx_doctor (D5) names the last hook error from <HOME>/.context-mode/hook-errors.log.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lastHookError, logHookError, hookLogPath } from "../../../src/core/hooks/fallback.ts";
import { D5_LAST_HOOK_ERROR } from "../../../src/core/contracts/constants.ts";

test("lastHookError: none when no log exists", (t) => {
  const home = mkdtempSync(join(tmpdir(), "cm-last-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  assert.equal(lastHookError({ HOME: home, USERPROFILE: home }), null);
});

test("lastHookError: returns the newest line; the log keeps every line", (t) => {
  const home = mkdtempSync(join(tmpdir(), "cm-last-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const env = { HOME: home, USERPROFILE: home };
  const e1 = new Error("first"); e1.code = "NODE_TOO_OLD";
  logHookError(env, "claude-code", "node", e1);
  logHookError(env, "claude-code", "store", new TypeError("second"));
  const last = lastHookError(env);
  assert.equal(last.stage, "store");
  assert.equal(last.label, "TypeError");
  assert.match(D5_LAST_HOOK_ERROR(last.ts, last.stage, last.label), /last hook error .* at store \(TypeError\)/);
  assert.equal(hookLogPath(env).endsWith("hook-errors.log"), true);
});

test("logHookError and lastHookError never throw without a home", () => {
  logHookError({}, "claude-code", "decode", new Error("x"));
  assert.equal(lastHookError({}), null);
});
