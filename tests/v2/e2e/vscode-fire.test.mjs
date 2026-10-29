// D-NI-VSCODE-GATE-1. Two layers.
// The (node only): the built package is set up into a temp HOME with the documented path, then the exact command
//    setup wrote for PreToolUse is run with VS Code's documented payload (run_in_terminal, cat of a 200 KB log). The answer
//    must be a deny that carries the ctx_execute redirect, not the file.
// No live VS Code run is claimed: 1.144.0 was driven in a temp HOME with a customendpoint model (chatLanguageModels.json)
// pointing at a local fake provider, but the headless chat never sent a request to it (sign-in gate).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { runDoctor, runSetup } from "../../../src/setup/index.ts";

const BUILD = resolve("build/build.mjs");

test("D-NI-VSCODE-GATE-1: the hook command setup wrote for vscode denies a 200 KB cat and the model-side text is the ctx_execute redirect", async (t) => {
  const d = mkdtempSync(join(tmpdir(), "cm-vsfire-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  const home = join(d, "home");
  const work = join(d, "work");
  const pkg = join(d, "pkg");
  mkdirSync(home, { recursive: true });
  mkdirSync(work);
  writeFileSync(join(work, "big.log"), "line lorem ipsum dolor sit amet\n".repeat(6500));
  const built = spawnSync(process.execPath, [BUILD, "--out", pkg], { encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
  const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home, CM_HOOK_OVERHEAD_BUDGET_MS: "60000" };
  const res = await runSetup({ home, pkgDir: pkg, env, agents: ["vscode"], runId: "r1" });
  assert.equal(res.agents[0].status, "PASS", JSON.stringify(res.agents[0]));
  const doc = await runDoctor({ home, pkgDir: pkg, env, agents: ["vscode"] });
  assert.equal(doc.agents[0].status, "PASS", JSON.stringify(doc.agents[0]));
  const file = JSON.parse(readFileSync(join(home, ".copilot", "hooks", "context-mode-vscode.json"), "utf8"));
  const entry = file.hooks.PreToolUse[0];
  assert.equal(entry.type, "command");
  const payload = { hook_event_name: "PreToolUse", session_id: "s1", cwd: work, tool_name: "run_in_terminal", tool_input: { command: "cat big.log" } };
  const run = spawnSync(entry.command, { shell: true, cwd: work, env, input: JSON.stringify(payload), encoding: "utf8", timeout: 30000 });
  const out = `${run.stdout}${run.stderr}`;
  assert.match(out, /ctx_execute|ctx_search/, out.slice(0, 400));
  assert.ok(out.length < 4000, `the model gets ${out.length} bytes, not the 208 KB file`);
});
