/**
 * ctx-debug.sh POSIX-sh re-exec guard — closes #1242.
 *
 * ctx-debug.sh relies on bash-only syntax (arrays, `set -o pipefail`, process
 * substitution at the HOOK_FILES/STALE_HOOKS/SESSION_DIRS loops), but plugin
 * validation and some agents invoke it with a plain POSIX `sh`. Under sh,
 * parsing dies on the first process substitution:
 *
 *     scripts/ctx-debug.sh: line 501: syntax error near unexpected token `<'
 *
 * The fix re-execs under bash as the first executable statement ("Option A"
 * from #1242, hardened): a BASH_VERSION-only probe is NOT enough, because
 * macOS /bin/sh is bash running in POSIX mode — it sets BASH_VERSION but has
 * no process substitution. The guard therefore re-execs when BASH_VERSION is
 * unset (dash et al.) OR SHELLOPTS contains "posix" (bash in POSIX mode),
 * with an explicit error when no bash exists at all. The behavioral probe
 * below fails for a BASH_VERSION-only guard on macOS — CI's macos-latest leg
 * proves it.
 *
 * SEAM NOTE: matching the established scripts-test pattern
 * (tests/scripts/start-mjs-reexec-teardown-862.test.ts), the guard is pinned
 * at the text level on every platform (cheap, no portability risk), plus a
 * behavioral probe on POSIX platforms: without the guard, sh dies with the
 * #1242 syntax error within milliseconds; with it, the script is still busy
 * running diagnostics when the probe window closes.
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT_PATH = resolve(REPO_ROOT, "scripts", "ctx-debug.sh");
const SCRIPT_TEXT = readFileSync(SCRIPT_PATH, "utf8");

/** First executable statement of the #1242 fix must appear in the file head. */
const GUARD_EXEC = 'exec bash "$0" "$@"';
/** dash/POSIX-sh aborts here (`Illegal option -o pipefail`) if the guard is too late. */
const SET_LINE = "set -uo pipefail";
/** First bash-only construct the parser chokes on under strict POSIX sh. */
const FIRST_BASH_ONLY = "ADAPTER_VARS=(";
/** The #1242 failure signature (bash-as-sh parse error at a process substitution). */
const SYNTAX_ERROR_SIGNATURE = "syntax error near unexpected token";

describe("ctx-debug.sh POSIX-sh re-exec guard (#1242)", () => {
  it("pins the guard as the first executable statement (text level, all platforms)", () => {
    const guardAt = SCRIPT_TEXT.indexOf(GUARD_EXEC);
    const setAt = SCRIPT_TEXT.indexOf(SET_LINE);
    const firstBashOnlyAt = SCRIPT_TEXT.indexOf(FIRST_BASH_ONLY);

    expect(guardAt, "guard (exec bash \"$0\" \"$@\") not found").toBeGreaterThan(-1);
    expect(setAt, "set -uo pipefail not found").toBeGreaterThan(-1);
    expect(
      guardAt,
      "guard must run before `set -uo pipefail` (dash dies there first)",
    ).toBeLessThan(setAt);
    expect(
      guardAt,
      "guard must run before the first bash-only construct",
    ).toBeLessThan(firstBashOnlyAt);
    expect(SCRIPT_TEXT).toContain("[ -z \"${BASH_VERSION:-}\" ]");
    // macOS /bin/sh sets BASH_VERSION (bash in POSIX mode) — the guard must
    // also treat SHELLOPTS containing "posix" as POSIX sh, or the script
    // still dies at the first process substitution on macOS.
    expect(SCRIPT_TEXT).toContain("${SHELLOPTS#*posix}");
    // No bash available → fail loudly instead of a cryptic syntax error.
    expect(SCRIPT_TEXT).toContain("bash is required");
  });

  it.skipIf(process.platform === "win32")(
    "parses cleanly under bash -n (the intended interpreter)",
    () => {
      const res = spawnSync("bash", ["-n", SCRIPT_PATH], { encoding: "utf8" });
      expect(res.status, `bash -n failed: ${res.stderr}`).toBe(0);
    },
  );

  it.skipIf(process.platform === "win32")(
    "survives POSIX-sh invocation instead of dying at the #1242 syntax error",
    () => {
      // Full diagnostics take a while; a 10s window is plenty. The old code
      // fails at parse time in well under a second, so reaching the window
      // close (timeout kill → status=null / signal set) or exiting under its
      // own control both prove the re-exec fired. A POSIX parse error always
      // carries the signature asserted below, regardless of line numbers.
      const res = spawnSync("sh", [SCRIPT_PATH], {
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
