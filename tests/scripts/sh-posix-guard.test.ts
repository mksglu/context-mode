/**
 * Repo-wide POSIX-sh re-exec guard for every tracked shell script — #1242.
 *
 * context-mode's shell scripts rely on bash-only features (`set -o
 * pipefail`, `${BASH_SOURCE[0]}`, arrays, process substitution), but plugin
 * validation and some agents invoke scripts with a plain POSIX `sh`. Under
 * such shells the scripts die with confusing errors (e.g. #1242:
 * "syntax error near unexpected token `<'" at the first process
 * substitution in scripts/ctx-debug.sh; dash aborts even earlier with
 * "Illegal option -o pipefail").
 *
 * Every tracked *.sh therefore carries a hardened re-exec guard as its
 * first executable statement: run under bash when BASH_VERSION is unset
 * (dash et al.) OR SHELLOPTS contains "posix" (bash running in POSIX mode —
 * macOS /bin/sh sets BASH_VERSION but has no process substitution, so a
 * BASH_VERSION-only probe would not fire there), and fail with an explicit
 * message when bash is missing.
 *
 * SEAM NOTE: matching the established scripts-test pattern
 * (tests/scripts/start-mjs-reexec-teardown-862.test.ts), the guard is pinned
 * at the text level on every platform (cheap, no portability risk), with
 * `bash -n` parse checks on POSIX platforms. scripts/ctx-debug.sh
 * additionally gets a behavioral probe: it is the only guard target that is
 * safe to spawn (the installer and the E2E/smoke runners mutate state or
 * need live services), and it is the script from the original #1242 report.
 */

import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..", "..");
const GUARD_EXEC = 'exec bash "$0" "$@"';
const SYNTAX_ERROR_SIGNATURE = "syntax error near unexpected token";

/** Every tracked shell script must carry the guard — including future ones. */
const SCRIPTS = execFileSync("git", ["ls-files", "*.sh"], {
  cwd: REPO_ROOT,
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);

describe("shell scripts carry the POSIX-sh re-exec guard (#1242)", () => {
  it("discovers the guarded scripts (inventory sanity)", () => {
    expect(SCRIPTS.length).toBeGreaterThanOrEqual(4);
    expect(SCRIPTS).toContain("scripts/ctx-debug.sh");
  });

  it.each(SCRIPTS)(
    "%s: guard is the first executable statement (text level, all platforms)",
    (script) => {
      const text = readFileSync(resolve(REPO_ROOT, script), "utf8");
      // Strip comment lines: the guard's own comment names the constructs it
      // defends against, so anchor searches must run over code only.
      const code = text
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("#"))
        .join("\n");
      const guardAt = code.indexOf(GUARD_EXEC);
      expect(guardAt, `guard ("${GUARD_EXEC}") not found`).toBeGreaterThan(-1);
      expect(code).toContain('[ -z "${BASH_VERSION:-}" ]');
      // macOS /bin/sh sets BASH_VERSION (bash in POSIX mode) — the guard must
      // also treat SHELLOPTS containing "posix" as POSIX sh, or the script
      // still dies on macOS.
      expect(code).toContain("${SHELLOPTS#*posix}");
      // No bash available → fail loudly instead of a cryptic shell error.
      expect(code).toContain("bash is required");
      // The guard must precede the constructs POSIX sh chokes on (searched in
      // code only, for the same reason).
      for (const anchor of ["pipefail", "${BASH_SOURCE[0]}"]) {
        const at = code.indexOf(anchor);
        if (at !== -1) {
          expect(
            guardAt,
            `guard must precede ${JSON.stringify(anchor)}`,
          ).toBeLessThan(at);
        }
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "parses cleanly under bash -n (the intended interpreter)",
    () => {
      for (const script of SCRIPTS) {
        const res = spawnSync("bash", ["-n", resolve(REPO_ROOT, script)], {
          encoding: "utf8",
        });
        expect(
          res.status,
          `bash -n failed for ${script}: ${res.stderr}`,
        ).toBe(0);
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "ctx-debug.sh survives POSIX-sh invocation instead of dying at the #1242 syntax error",
    () => {
      // Full diagnostics take a while; a 10s window is plenty. The old code
      // fails at parse time in well under a second, so reaching the window
      // close (timeout kill → status=null / signal set) or exiting under its
      // own control both prove the re-exec fired. A POSIX parse error always
      // carries the signature asserted below, regardless of line numbers.
      const script = resolve(REPO_ROOT, "scripts/ctx-debug.sh");
      const res = spawnSync("sh", [script], {
        encoding: "utf8",
        timeout: 10_000,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stderr = res.stderr ?? "";
      expect(
        stderr.includes(SYNTAX_ERROR_SIGNATURE),
        `ctx-debug.sh hit a POSIX parse error under sh:\n${stderr.slice(0, 2000)}`,
      ).toBe(false);
    },
    20_000,
  );
});
