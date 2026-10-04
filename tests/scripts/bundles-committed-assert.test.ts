/**
 * scripts/assert-bundles-committed.mjs — drift guard regression tests.
 *
 * The guard exists because scripts/assert-bundle.mjs only inspects bundle
 * content; it never compares a bundle against a build of src/. A commit that
 * edits src/ without regenerating the bundles therefore passes every check in
 * `npm run build` and every test in `vitest run`, while shipping the previous
 * build. These tests pin the guard's three verdicts against a real git repo so
 * the guard cannot silently degrade into a no-op the way assert-bundle's
 * main() did on Windows.
 *
 * Run: npx vitest run tests/scripts/bundles-committed-assert.test.ts
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, test, expect, beforeAll, afterAll } from "vitest";

const SCRIPT = join(process.cwd(), "scripts", "assert-bundles-committed.mjs");

let repo: string;

/** Run git inside the throwaway repo. */
function git(args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf-8" });
}

function commit(msg: string): void {
  git(["add", "-A"]);
  git([
    "-c",
    "user.email=t@example.com",
    "-c",
    "user.name=t",
    "commit",
    "-m",
    msg,
  ]);
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "ctx-bundle-drift-"));
  git(["init", "--quiet", "--initial-branch=main"]);
  mkdirSync(join(repo, "src"));
  writeFileSync(join(repo, "src", "server.ts"), "export const a = 1;\n");
  writeFileSync(join(repo, "server.bundle.mjs"), "export const a=1;\n");
  commit("initial");
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

/**
 * Evaluate one file in the throwaway repo via a child process.
 *
 * checkBundleCommitted reads git state relative to process.cwd(), and this
 * suite's own cwd is the real repository, so the verdict has to come from a
 * child pinned to the throwaway repo.
 */
function verdictFor(file: string): {
  committed: boolean;
  reason: string | null;
} {
  const out = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { checkBundleCommitted } from ${JSON.stringify(SCRIPT)};
       process.stdout.write(JSON.stringify(checkBundleCommitted(${JSON.stringify(file)})));`,
    ],
    { cwd: repo, encoding: "utf-8" },
  );
  return JSON.parse(out);
}

describe("assert-bundles-committed: verdicts", () => {
  test("a tracked bundle identical to HEAD is committed", () => {
    const v = verdictFor("server.bundle.mjs");
    expect(v.committed).toBe(true);
    expect(v.reason).toBeNull();
  });

  test("a tracked bundle that differs from HEAD is reported as stale", () => {
    writeFileSync(join(repo, "server.bundle.mjs"), "export const a=2;\n");
    try {
      const v = verdictFor("server.bundle.mjs");
      expect(v.committed).toBe(false);
      expect(v.reason).toMatch(/differs from HEAD/);
      expect(v.reason).toMatch(/npm run bundle/);
    } finally {
      git(["checkout", "--", "server.bundle.mjs"]);
    }
  });

  test("a path git does not track is reported as untracked, not as up to date", () => {
    writeFileSync(join(repo, "never-committed.bundle.mjs"), "x\n");
    const v = verdictFor("never-committed.bundle.mjs");
    expect(v.committed).toBe(false);
    expect(v.reason).toMatch(/not tracked by git/);
  });

  test("reverting the source and rebuilding restores a committed verdict", () => {
    // The real failure mode: src/ edited, bundle rebuilt, bundle not committed.
    writeFileSync(join(repo, "src", "server.ts"), "export const a = 2;\n");
    writeFileSync(join(repo, "server.bundle.mjs"), "export const a=2;\n");
    const stale = verdictFor("server.bundle.mjs");
    expect(stale.committed).toBe(false);

    commit("edit source and rebuild bundle together");
    const fresh = verdictFor("server.bundle.mjs");
    expect(fresh.committed).toBe(true);
  });
});

describe("assert-bundles-committed: CLI contract", () => {
  test("exits 2 with a usage message when no paths are given", () => {
    let code = 0;
    let stderr = "";
    try {
      execFileSync(process.execPath, [SCRIPT], {
        encoding: "utf-8",
        stdio: "pipe",
      });
    } catch (e) {
      code = (e as { status: number }).status;
      stderr = (e as { stderr: string }).stderr;
    }
    expect(code).toBe(2);
    expect(stderr).toMatch(/no bundle paths provided/);
  });

  test("main() actually runs when invoked directly", () => {
    // Regression shape from assert-bundle: a naive `file://${argv[1]}`
    // comparison never matches on Windows, so the script exits 0 with no
    // output and the guardrail is vacuous there. Assert the direct-invocation
    // path produces the usage error rather than silently succeeding.
    let code = 0;
    try {
      execFileSync(process.execPath, [SCRIPT], {
        encoding: "utf-8",
        stdio: "pipe",
      });
    } catch (e) {
      code = (e as { status: number }).status;
    }
    expect(code).not.toBe(0);
  });

  test("exits 0 outside a git work tree instead of failing a tarball install", () => {
    const notARepo = mkdtempSync(join(tmpdir(), "ctx-not-a-repo-"));
    try {
      const out = execFileSync(
        process.execPath,
        [SCRIPT, "server.bundle.mjs"],
        { cwd: notARepo, encoding: "utf-8" },
      );
      expect(out).toMatch(/SKIP/);
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }
  });
});
