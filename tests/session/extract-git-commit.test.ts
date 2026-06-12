/**
 * Bug 1 repro — extractGit() commit message capture.
 *
 * Symptom: `git commit -m "feat: x"` → event.data is `"commit"` (operation
 * name) instead of `"feat: x"` (actual commit message). Downstream consumers
 * (platform `commit_message` column) inherit the operation name as the
 * commit message, which is meaningless.
 *
 * Per /diagnose discipline this file exists to REPRODUCE the bug at a
 * deterministic vitest seam before any fix is applied. Each test below
 * starts RED today; the fix will flip them to GREEN one tracer at a time.
 */

import { describe, test, expect } from "vitest";
import { extractEvents } from "../../src/session/extract.js";

function dataOf(cmd: string): string | undefined {
  const events = extractEvents({
    tool_name: "Bash",
    tool_input: { command: cmd },
    tool_response: "",
    tool_output: undefined,
  });
  return events.find((e) => e.category === "git")?.data;
}

describe("extractGit — Bug 1 repro: commit message capture", () => {
  test("tracer: `git commit -m \"feat: x\"` → event.data is the message", () => {
    expect(dataOf(`git commit -m "feat: x"`)).toBe("feat: x");
  });

  test("single-quoted message survives", () => {
    expect(dataOf(`git commit -m 'single quoted'`)).toBe("single quoted");
  });

  test("combined flag cluster `-am` recognised", () => {
    expect(dataOf(`git commit -am "stage+commit"`)).toBe("stage+commit");
  });

  test("long form `--message=value` (attached)", () => {
    expect(dataOf(`git commit --message=longform`)).toBe("longform");
  });

  test("long form `--message value` (separate token)", () => {
    expect(dataOf(`git commit --message "separate"`)).toBe("separate");
  });

  test("--amend without -m falls back to operation name", () => {
    expect(dataOf(`git commit --amend --no-edit`)).toBe("commit");
  });

  test("empty `-m \"\"` falls back to operation name", () => {
    expect(dataOf(`git commit -m ""`)).toBe("commit");
  });

  test("non-commit operations carry the operation name unchanged", () => {
    expect(dataOf(`git push origin main`)).toBe("push");
    expect(dataOf(`git diff HEAD~1`)).toBe("diff");
    expect(dataOf(`git status`)).toBe("status");
  });

  test("messages containing colons and special chars are preserved verbatim", () => {
    expect(dataOf(`git commit -m "fix: navbar — handle long URLs"`))
      .toBe("fix: navbar — handle long URLs");
  });

  test("env-prefixed invocation is tolerated", () => {
    expect(dataOf(`GIT_AUTHOR_DATE=now git commit -m "with env"`))
      .toBe("with env");
  });

  test("type discriminator: commits get type='git_commit', other ops keep type='git'", () => {
    function typeOf(cmd: string): string | undefined {
      const events = extractEvents({
        tool_name: "Bash",
        tool_input: { command: cmd },
        tool_response: "",
        tool_output: undefined,
      });
      return events.find((e) => e.category === "git")?.type;
    }
    expect(typeOf(`git commit -m "x"`)).toBe("git_commit");
    expect(typeOf(`git commit --amend`)).toBe("git"); // no -m → not promoted
    expect(typeOf(`git push`)).toBe("git");
    expect(typeOf(`git diff HEAD`)).toBe("git");
  });
});
