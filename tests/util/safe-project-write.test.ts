/**
 * Regression: writeProjectConfigSafely must not follow a symlink out of the
 * project dir. Adapters write cwd-relative config (e.g. .cursor/hooks.json,
 * opencode.json); a cloned/malicious repo can plant a symlink at the file or its
 * parent dir so a plain writeFileSync would truncate an arbitrary file such as
 * ~/.bashrc.
 */
import { describe, test, beforeEach, afterEach } from "vitest";
import { strict as assert } from "node:assert";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  writeProjectConfigSafely,
  symlinkEscapesRoot,
  isSymlinkEscapeError,
  SymlinkEscapeError,
} from "../../build/util/safe-project-write.js";

describe("writeProjectConfigSafely", () => {
  let base: string;
  let projectDir: string;
  let outsideDir: string;
  let origCwd: string;

  beforeEach(() => {
    origCwd = process.cwd();
    base = mkdtempSync(join(tmpdir(), "ctx-safewrite-"));
    projectDir = join(base, "project");
    outsideDir = join(base, "outside");
    mkdirSync(projectDir);
    mkdirSync(outsideDir);
    process.chdir(projectDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(base, { recursive: true, force: true });
  });

  test("writes a project-local config and creates the parent dir", () => {
    writeProjectConfigSafely(resolve(".cursor", "hooks.json"), "{}\n");
    assert.equal(readFileSync(resolve(".cursor", "hooks.json"), "utf-8"), "{}\n");
  });

  test("refuses to follow a symlinked final component (no out-of-root overwrite)", () => {
    const victim = join(outsideDir, "victim");
    writeFileSync(victim, "ORIGINAL");
    symlinkSync(victim, resolve("evil.json")); // evil.json -> outside/victim
    assert.throws(() => writeProjectConfigSafely(resolve("evil.json"), "CLOBBERED"));
    assert.equal(readFileSync(victim, "utf-8"), "ORIGINAL");
  });

  test("refuses when the parent dir is a symlink escaping the project", () => {
    symlinkSync(outsideDir, resolve(".cursor")); // .cursor -> outside/
    const victim = join(outsideDir, "hooks.json");
    writeFileSync(victim, "ORIGINAL");
    assert.throws(() =>
      writeProjectConfigSafely(resolve(".cursor", "hooks.json"), "CLOBBERED"),
    );
    assert.equal(readFileSync(victim, "utf-8"), "ORIGINAL");
    assert.ok(!existsSync(join(outsideDir, "hooks.json.tmp")));
  });

  // A dotfile manager (stow/chezmoi/yadm) or an intra-repo layout legitimately
  // symlinks a config dir or file to another path *under* the project. Following
  // it stays in-tree, so it can't clobber ~/.bashrc; refusing every symlink was
  // an over-fix that hard-failed setup for those users. Accept an in-root link.
  test("accepts an in-root symlinked dir and writes through to the real location", () => {
    mkdirSync(resolve("real-cursor"));
    symlinkSync(resolve("real-cursor"), resolve(".cursor")); // .cursor -> real-cursor (in-root)
    writeProjectConfigSafely(resolve(".cursor", "hooks.json"), "{}\n");
    assert.equal(readFileSync(resolve("real-cursor", "hooks.json"), "utf-8"), "{}\n");
  });

  test("accepts an in-root symlinked final component and writes through it", () => {
    mkdirSync(resolve("shared"));
    writeFileSync(resolve("shared", "real.json"), "OLD");
    symlinkSync(resolve("shared", "real.json"), resolve("cfg.json")); // cfg.json -> shared/real.json
    writeProjectConfigSafely(resolve("cfg.json"), "NEW\n");
    assert.equal(readFileSync(resolve("shared", "real.json"), "utf-8"), "NEW\n");
  });

  test("symlinkEscapesRoot: in-root false, escaping true, dangling true, non-symlink/missing false", () => {
    const root = process.cwd();
    writeFileSync(resolve("plain.json"), "{}");
    assert.equal(symlinkEscapesRoot(resolve("plain.json"), root), false); // regular file
    assert.equal(symlinkEscapesRoot(resolve("nope.json"), root), false); // missing path
    mkdirSync(resolve("inroot"));
    symlinkSync(resolve("inroot"), resolve("link-in")); // -> inroot (under root)
    assert.equal(symlinkEscapesRoot(resolve("link-in"), root), false);
    symlinkSync(outsideDir, resolve("link-out")); // -> outside/ (escapes root)
    assert.equal(symlinkEscapesRoot(resolve("link-out"), root), true);
    // A dangling link can't be resolved, so we can't prove it stays in-tree; refuse it.
    symlinkSync(join(outsideDir, "ghost"), resolve("link-dangling"));
    assert.equal(symlinkEscapesRoot(resolve("link-dangling"), root), true);
  });

  test("isSymlinkEscapeError tells the recoverable refusal apart from a generic error", () => {
    assert.equal(isSymlinkEscapeError(new SymlinkEscapeError("x")), true);
    assert.equal(isSymlinkEscapeError(new Error("x")), false);
    assert.equal(isSymlinkEscapeError("not even an error"), false);
  });
});
