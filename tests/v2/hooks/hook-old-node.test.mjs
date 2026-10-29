// tests/v2/hooks/hook-old-node.test.mjs
// D-HNE-OLDNODE-1: process.getBuiltinModule exists from Node 22.3 (and 20.16). On an older Node on PATH the built hook threw
// "TypeError: process.getBuiltinModule is not a function" at load and exited 1: Copilot CLI shows "Denied by preToolUse hook
// (hook errored)" for every tool. The hook must load and answer (exit 0) whatever Node runs it. The preload removes the
// function, so this test runs on any Node.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");

test("[D-HNE-OLDNODE-1] hook bundle loads and exits 0 when process.getBuiltinModule is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "cm-oldnode-"));
  try {
    const out = join(dir, "out");
    const b = spawnSync(process.execPath, [join(ROOT, "build", "build.mjs"), "--out", out], { encoding: "utf8", cwd: ROOT });
    assert.equal(b.status, 0, b.stderr);
    const pre = join(dir, "pre.cjs");
    writeFileSync(pre, "delete process.getBuiltinModule;");
    const input = JSON.stringify({ hookEventName: "preToolUse", sessionId: "old-node", cwd: dir, toolName: "bash", toolArgs: JSON.stringify({ command: "true" }) });
    const r = spawnSync(process.execPath, ["--require", pre, join(out, "hook.mjs"), "--agent", "copilot-cli"], { input, encoding: "utf8", env: { ...process.env, HOME: dir, USERPROFILE: dir } });
    assert.equal(r.status, 0, r.stderr.slice(-400));
    assert.ok(!r.stderr.includes("getBuiltinModule is not a function"), r.stderr.slice(-400));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
