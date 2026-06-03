/**
 * Gap #2 (16-oss-verify-gap-prd §2) — git -C tilde expansion +
 * --directory=/path equals-form.
 *
 * Symptom: `git -C ~/repos/myrepo` was passed through verbatim because
 * absolutizePath treats `~/path` as relative. Result: attribution
 * resolved against an anchor → `<anchor>/~/path` (wrong directory),
 * falls back to inputProjectDir, misses the user's intent.
 *
 * Fix surfaces on the public extractEvents API: when a Bash git command
 * carries `-C <dir>` or `--directory <dir>` or `--directory=<dir>`, the
 * cwd event emitted by extractGit must carry the expanded scopedDir.
 */

import { describe, test, expect } from "vitest";
import { homedir } from "node:os";
import { extractEvents } from "../../src/session/extract.js";

function cwdEventDataOf(cmd: string): string | undefined {
  return extractEvents({
    tool_name: "Bash",
    tool_input: { command: cmd },
    tool_response: "",
  }).find((e) => e.type === "cwd")?.data;
}

describe("parseGitInvocation — Gap #2 tilde + --directory=", () => {
  test("tracer: `git -C ~/repos/myrepo status` → expanded homedir", () => {
    const data = cwdEventDataOf(`git -C ~/repos/myrepo status`);
    expect(data).toBe(`${homedir()}/repos/myrepo`);
  });

  test("`git --directory=/abs/x log` (equals form) → /abs/x", () => {
    const data = cwdEventDataOf(`git --directory=/abs/x log`);
    expect(data).toBe(`/abs/x`);
  });

  test("regression: `git --directory /abs/x log` (space form) → /abs/x", () => {
    const data = cwdEventDataOf(`git --directory /abs/x log`);
    expect(data).toBe(`/abs/x`);
  });

  test("`git -C ~/repos commit -m \"feat\"` emits BOTH cwd + git_commit", () => {
    const events = extractEvents({
      tool_name: "Bash",
      tool_input: { command: `git -C ~/repos commit -m "feat: x"` },
      tool_response: "",
    });
    const cwd = events.find((e) => e.type === "cwd");
    const commit = events.find((e) => e.type === "git_commit");
    expect(cwd?.data).toBe(`${homedir()}/repos`);
    expect(commit?.data).toBe("feat: x");
  });

  test("bare `~` (no path tail) expands to homedir", () => {
    const data = cwdEventDataOf(`git -C ~ status`);
    expect(data).toBe(homedir());
  });

  test("`git -C ~user/foo` does NOT expand (no current user resolution)", () => {
    const data = cwdEventDataOf(`git -C ~someoneelse/foo status`);
    expect(data).toBe(`~someoneelse/foo`);
  });

  test("regression: `git -C /abs/path status` unchanged", () => {
    const data = cwdEventDataOf(`git -C /abs/path status`);
    expect(data).toBe(`/abs/path`);
  });

  test("regression: `git -C relative/path status` unchanged", () => {
    const data = cwdEventDataOf(`git -C relative/path status`);
    expect(data).toBe(`relative/path`);
  });

  test("`git --directory=~/abs status` expands equals-form tilde", () => {
    const data = cwdEventDataOf(`git --directory=~/abs status`);
    expect(data).toBe(`${homedir()}/abs`);
  });
});
