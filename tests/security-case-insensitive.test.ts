/**
 * Regression: command deny matching must be case-insensitive on case-insensitive
 * filesystems (macOS/Windows). There `RM`/`Rm` resolve to the same binary as
 * `rm`, so a deny like `Bash(rm:*)` must match regardless of case. Previously the
 * `caseInsensitive` default was win32-only, so on macOS `RM -rf` slipped past the
 * deny gate and still executed.
 */
import { describe, test } from "vitest";
import { strict as assert } from "node:assert";
import { evaluateCommand, evaluateCommandDenyOnly, evaluateFilePath } from "../build/security.js";

const policies = [{ allow: [], ask: [], deny: ["Bash(rm:*)"] }];

describe("command deny matching honors the caseInsensitive flag", () => {
  test("evaluateCommandDenyOnly denies an uppercased command when caseInsensitive", () => {
    assert.equal(evaluateCommandDenyOnly("RM -rf /tmp/x", policies, true).decision, "deny");
    assert.equal(evaluateCommandDenyOnly("Rm -rf /tmp/x", policies, true).decision, "deny");
  });

  test("evaluateCommand denies an uppercased command when caseInsensitive", () => {
    assert.equal(evaluateCommand("RM -rf /tmp/x", policies, true).decision, "deny");
  });

  test("case-sensitive matching still matches the exact case (and only that)", () => {
    assert.equal(evaluateCommandDenyOnly("rm -rf /tmp/x", policies, false).decision, "deny");
    assert.equal(evaluateCommandDenyOnly("RM -rf /tmp/x", policies, false).decision, "allow");
  });
});

describe("command deny default tracks case-insensitive filesystems", () => {
  const withPlatform = (p: string, fn: () => void) => {
    const orig = process.platform;
    Object.defineProperty(process, "platform", { value: p, configurable: true });
    try {
      fn();
    } finally {
      Object.defineProperty(process, "platform", { value: orig, configurable: true });
    }
  };

  test("darwin default denies an uppercased command", () => {
    withPlatform("darwin", () => {
      assert.equal(evaluateCommandDenyOnly("RM -rf /tmp/x", policies).decision, "deny");
      assert.equal(evaluateCommand("RM -rf /tmp/x", policies).decision, "deny");
    });
  });

  test("win32 default denies an uppercased command", () => {
    withPlatform("win32", () => {
      assert.equal(evaluateCommandDenyOnly("RM -rf /tmp/x", policies).decision, "deny");
    });
  });

  test("linux default leaves exact-case matching (RM is not a binary there)", () => {
    withPlatform("linux", () => {
      assert.equal(evaluateCommandDenyOnly("RM -rf /tmp/x", policies).decision, "allow");
    });
  });
});

// The Read-path deny callers used to pass `process.platform === "win32"`,
// overriding evaluateFilePath's win32||darwin default; on macOS that left the
// file-path deny case-sensitive. The callers now pass no flag (inherit the
// default), so a differently-cased path must be denied on darwin too.
describe("file-path deny default tracks case-insensitive filesystems", () => {
  const withPlatform = (p: string, fn: () => void) => {
    const orig = process.platform;
    Object.defineProperty(process, "platform", { value: p, configurable: true });
    try {
      fn();
    } finally {
      Object.defineProperty(process, "platform", { value: orig, configurable: true });
    }
  };
  const denyEnv: string[][] = [[".env"]];

  test("darwin default denies a differently-cased path (no explicit flag)", () => {
    withPlatform("darwin", () => {
      assert.equal(evaluateFilePath(".ENV", denyEnv).denied, true);
    });
  });

  test("linux default stays case-sensitive (.ENV does not match a .env deny)", () => {
    withPlatform("linux", () => {
      assert.equal(evaluateFilePath(".ENV", denyEnv).denied, false);
      assert.equal(evaluateFilePath(".env", denyEnv).denied, true);
    });
  });
});
