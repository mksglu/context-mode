#!/usr/bin/env node
// e2e/checks/v1-migration.mjs <agent> [--root <dir>] — the R8 v1 -> v2 switch rehearsal for one agent.
// Spec: docs/v2/impl/15-v1-transition.md §3; ADR-0017 R3, R4, R6, R8; ADR-0011 "v1 cleanup";
// DECISIONS-r4 A37 (Kiro steering doc), B28 (VS Code session paths, .vscode/mcp.json); DEVIATIONS D-M7-arch-6.
//
// Steps (one path, no fallback):
//   1. temp HOME (+ temp TMPDIR, temp npm_config_prefix whose bin dir is first on PATH) under --root or os.tmpdir()
//   2. plantV1Install(agent, home); the project dir is a git repo (resolveProject needs one)
//   3. spawn release-out/server.mjs --agent <agent> (the built server bundle; D-M7-arch-6 calls it
//      "server.bundle.mjs", build/build.mjs writes server.mjs) and call MCP ctx_doctor (before), ctx_upgrade,
//      ctx_doctor (after)
//   4. assert: D4 after the upgrade is PASS, or FAIL only for this agent's report-only leftovers (Gemini shared
//      data dir: the prompt is declined, the dir is kept; VS Code .vscode/mcp.json entry; Kiro steering doc);
//      VS Code: both session-data paths are in the D4 row before the upgrade; Kiro: KIRO.md is flagged, never
//      deleted
//   5. remove the planted global bin (stands for `npm uninstall -g context-mode`, R3 order: last)
//   6. run every hook command from release-out/hooks/<agent>.json (the hook entries the install writes) with
//      the GP3 fixture on stdin; expect exit 0
// Output: one JSON line {ok, agent, steps:[{step, ok, detail}]}; exit 0 when ok, else 1.
// Rules: no src/ import (GS4); deletes only the temp dir it made.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { spawnBundle } from "../harness/mcp-client.mjs";
import { plantV1Install, v1GlobalBin, v1NpmBinDir, v1NpmPrefix, v1Project } from "../live/cases/v1-migration-setup.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RELEASE_OUT = path.join(ROOT, "release-out");
const SERVER_BUNDLE = path.join(RELEASE_OUT, "server.mjs");
const FIXTURES = path.join(ROOT, "e2e", "fixtures");
const FIXTURE_EVENT = "PreToolUse.json"; // GP3 fixture-replay payload
const FIXTURE_FALLBACK_AGENT = "claude-code"; // agents with no recorded fixture get the Claude-shape payload
const INIT = { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e-v1-migration", version: "0" } };
const HOOK_TIMEOUT_MS = 30000;
const ROW_SEP = " | ";
const DATA_DIR_REASON = "old context-mode data dir "; // V1_REASON.dataDir text start
const D4_PREFIX = "| D4 "; // report.ts rowLine: "| " + id + " " + label
const WORKSPACE_FOLDER_FLAG = "--workspace-folder"; // VS Code project source (D-M1-5)

// impl/15 §3.2: the six agents whose v1 hooks (or v1 data) the R8 set rehearses.
const CASE_AGENTS = Object.freeze(["claude-code", "codex", "gemini", "copilot-cli", "vscode", "kiro"]);

// Report-only leftovers per agent: literal path parts the D4 detail names (ADR-0011, A37, B28).
const KEPT = Object.freeze({
  gemini: [path.join(".gemini", "context-mode")],
  vscode: [path.join(".vscode", "mcp.json")],
  kiro: [path.join(".kiro", "steering", "KIRO.md")],
});

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const agent = process.argv[2];
const steps = [];
const step = (name, ok, detail = "") => { steps.push({ step: name, ok, detail }); return ok; };

function finish(tempDir) {
  if (tempDir !== null) rmSync(tempDir, { recursive: true, force: true });
  const ok = steps.length > 0 && steps.every((s) => s.ok);
  console.log(JSON.stringify({ ok, agent, steps }));
  process.exit(ok ? 0 : 1);
}

const text = (r) => r?.content?.[0]?.text ?? "";

/** The D4 row {status, detail, line} from the doctor table ("| D4 old entries | FAIL | <detail> | <fix> |"), or null. */
function d4Row(report) {
  for (const line of report.split("\n")) {
    if (!line.startsWith(D4_PREFIX)) continue;
    const cells = line.split(ROW_SEP);
    return { status: cells[1], detail: cells[2] ?? "", line };
  }
  return null;
}

/** Every string value under a "command" key, in file order, without duplicates. */
function commandsOf(node, out = []) {
  if (Array.isArray(node)) { for (const v of node) commandsOf(v, out); return out; }
  if (node === null || typeof node !== "object") return out;
  for (const [k, v] of Object.entries(node)) {
    if (k === "command" && typeof v === "string") { if (!out.includes(v)) out.push(v); }
    else commandsOf(v, out);
  }
  return out;
}

/** GP3 fixture payload: e2e/fixtures/<agent>/<newest ver>/PreToolUse.json, or the Claude-shape one. */
function fixturePayload(project) {
  const own = path.join(FIXTURES, agent);
  const versIn = (b) => readdirSync(b).filter((v) => statSync(path.join(b, v)).isDirectory() && existsSync(path.join(b, v, FIXTURE_EVENT))).sort();
  // D-FU-OI-KIRO-1: an agent dir that holds no PreToolUse.json (kiro: SessionStart only) uses the Claude-shape payload.
  const base = existsSync(own) && versIn(own).length > 0 ? own : path.join(FIXTURES, FIXTURE_FALLBACK_AGENT);
  const vers = versIn(base);
  const payload = JSON.parse(readFileSync(path.join(base, vers[vers.length - 1], FIXTURE_EVENT), "utf8"));
  payload.cwd = project;
  return payload;
}

async function main() {
  if (!CASE_AGENTS.includes(agent)) {
    step("args", false, `usage: v1-migration.mjs <${CASE_AGENTS.join("|")}> [--root <dir>]`);
    return finish(null);
  }
  if (!existsSync(SERVER_BUNDLE)) {
    step("bundle", false, `missing ${SERVER_BUNDLE}: run node build/build.mjs --out release-out`);
    return finish(null);
  }
  const rootDir = arg("--root") ?? os.tmpdir();
  mkdirSync(rootDir, { recursive: true });
  const temp = realpathSync.native(mkdtempSync(path.join(rootDir, `cm-v1-migration-${agent}-`)));
  const home = path.join(temp, "home");
  const tmp = path.join(temp, "tmp");
  mkdirSync(home);
  mkdirSync(tmp);

  // Step 2: plant v1, then make the project a git repo.
  plantV1Install(agent, home);
  const project = v1Project(home);
  mkdirSync(project, { recursive: true });
  execFileSync("git", ["init", "-q", project]);
  const bin = v1GlobalBin(home);
  step("plant", existsSync(bin), bin);

  const env = {
    PATH: v1NpmBinDir(home) + path.delimiter + (process.env.PATH ?? ""),
    HOME: home, USERPROFILE: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp,
    npm_config_prefix: v1NpmPrefix(home),
    ...(agent === "claude-code" ? { CLAUDE_PROJECT_DIR: project } : {}),
  };

  // Step 3: doctor (before) -> upgrade -> doctor (after), one server process, cwd = project.
  const prevCwd = process.cwd();
  process.chdir(project);
  const c = spawnBundle(SERVER_BUNDLE, env, ["--agent", agent, ...(agent === "vscode" ? [WORKSPACE_FOLDER_FLAG, project] : [])]);
  process.chdir(prevCwd);
  let before = "", upgrade = "", after = "", upgradeErr = false;
  try {
    await c.request("initialize", INIT);
    c.notify("notifications/initialized");
    before = text(await c.request("tools/call", { name: "ctx_doctor", arguments: {} }));
    const u = await c.request("tools/call", { name: "ctx_upgrade", arguments: {} });
    upgrade = text(u);
    upgradeErr = u?.isError === true;
    after = text(await c.request("tools/call", { name: "ctx_doctor", arguments: {} }));
  } catch (err) {
    step("mcp", false, String(err?.message ?? err));
  } finally {
    await c.close().catch(() => c.kill());
  }
  if (steps.some((s) => !s.ok)) return finish(temp);

  // Step 4: D4 before lists old entries; after is clean except the report-only ones.
  const d4Before = d4Row(before);
  step("doctor-before-d4-fail", d4Before?.status === "FAIL", d4Before?.line ?? before.split("\n")[0]);
  step("upgrade", !upgradeErr && upgrade.length > 0, upgrade.split("\n").slice(0, 3).join(" / "));
  const d4After = d4Row(after);
  const kept = KEPT[agent] ?? [];
  if (d4After === null) step("doctor-after-d4", false, "no D4 row: " + after.split("\n")[0]);
  else if (d4After.status === "PASS") step("doctor-after-d4", kept.length === 0, d4After.line);
  else {
    const detail = d4After.detail;
    const reasons = detail.split("; ").filter(Boolean);
    const unexpected = reasons.filter((r) => !kept.some((k) => r.includes(k) || r.includes(path.basename(k))));
    step("doctor-after-d4", unexpected.length === 0, unexpected.length ? "unexpected: " + unexpected.join("; ") : detail);
  }
  for (const k of kept) {
    const where = k.startsWith(".vscode") || k.startsWith(".kiro") ? path.join(project, k) : path.join(home, k);
    step(`kept ${k}`, existsSync(where) && (d4After?.detail ?? "").includes(path.basename(k)), where);
  }
  if (agent === "vscode") {
    const sessions = [path.join(project, ".github", "context-mode", "sessions"), path.join(home, ".vscode", "context-mode", "sessions")];
    // The D4 detail joins reasons only (doctor-config.ts), so each path shows as one data-dir reason there and
    // by name in the ctx_upgrade change table (D-M7-V2-1).
    const dataReasons = (d4Before?.detail ?? "").split("; ").filter((r) => r.startsWith(DATA_DIR_REASON)).length;
    step("vscode-both-session-paths", dataReasons >= sessions.length && sessions.every((s) => upgrade.includes(s)),
      `${dataReasons} data-dir reasons; ` + sessions.join(", "));
  }

  // Step 5: npm uninstall -g (R3: last).
  rmSync(bin, { force: true });
  step("uninstall-global-bin", !existsSync(bin), bin);

  // Step 6: the written hook commands still run (they never call the global bin).
  // D-FU-RM-GEMINI-1: Gemini reads only <ext>/hooks/hooks.json, and its commands name the script as
  // ${extensionPath}${/}hook.mjs; the host fills both, so the check does the same (as windows-hosts.mjs does).
  const hooksFile = path.join(RELEASE_OUT, "hooks", agent === "gemini" ? "hooks.json" : `${agent}.json`);
  const hostFill = (cmd) => cmd.split("${extensionPath}").join(RELEASE_OUT).split("${/}").join(path.sep);
  const commands = existsSync(hooksFile) ? commandsOf(JSON.parse(readFileSync(hooksFile, "utf8"))).map(hostFill) : [];
  step("hook-commands", commands.length > 0, hooksFile);
  const payload = JSON.stringify(fixturePayload(project));
  for (const cmd of commands) {
    const r = spawnSync(cmd, { shell: true, cwd: RELEASE_OUT, input: payload, encoding: "utf8", timeout: HOOK_TIMEOUT_MS,
      env: { ...env, CLAUDE_PLUGIN_ROOT: RELEASE_OUT, CLAUDE_PROJECT_DIR: project } });
    step(`hook ${cmd}`, r.status === 0, r.status === 0 ? "exit 0" : `exit ${r.status}: ${(r.stderr || r.stdout || "").split("\n")[0]}`);
  }
  return finish(temp);
}

main().catch((err) => { step("crash", false, String(err?.stack ?? err).split("\n")[0]); finish(null); });
