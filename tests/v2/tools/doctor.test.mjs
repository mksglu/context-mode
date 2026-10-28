// tests/v2/tools/doctor.test.mjs
// Spec: docs/v2/impl/07-tools-ops.md §5 (ctxDoctor ToolDef + runDoctorChecks), ADR-0010, TECH-SPEC §6.2 GP11;
// DEVIATIONS D-M5-arch-3/4/5, D-M5-D6-1 (test drives runDoctorChecks(ctx, adapter, host), the impl/07 shape).
// D8 is one row whose detail names which of stale-schema / integrity_check failed (A-T5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite"; // v2 has one engine, node:sqlite (ADR-0002); better-sqlite3 is gone (D-PKG-META-1)

import { ctxDoctor, runDoctorChecks } from "../../../src/core/tools/doctor.ts";
import { getAdapter } from "../../../src/adapters/table.ts";
import { composeMatcher } from "../../../src/core/ops/doctor-config.ts";
import * as C from "../../../src/core/contracts/constants.ts";

const KEY = "d".repeat(16);
const ORDER = ["D1", "D2", "D3", "D4", "D5", "D5b", "D6", "D7", "D8", "D9", "D10", "D11"];

function tmp(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "cm-doctor-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function ctxFor(home, agent = "claude-code") {
  const projectDir = path.join(home, ".context-mode", "projects", KEY);
  const source = getAdapter(agent).projectSource;
  return {
    project: { projectKey: KEY, projectDir, dbPath: path.join(projectDir, "context.db"), worktree: home, containmentRoot: home, agent, source },
    sessionId: "s1", turn: 1, signal: new AbortController().signal, protocolVersion: "2025-06-18",
  };
}

async function doctor(home, agent = "claude-code", extraEnv = {}) {
  const ctx = ctxFor(home, agent);
  const host = { env: { HOME: home, USERPROFILE: home, PATH: process.env.PATH ?? "", ...extraEnv }, bundleDir: path.join(home, "no-bundle"), piCwd: undefined };
  return { ctx, rows: await runDoctorChecks(ctx, getAdapter(agent), host) };
}

const put = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value), "utf8");
};

test("[M5] doctor/returns-ten-row-ids-D1-D10 in DOCTOR_CHECK_ORDER", async (t) => {
  const { rows } = await doctor(tmp(t));
  assert.deepEqual(rows.map((r) => r.id), ORDER);
});

test("[M5] doctor/D8-stale-schema-and-integrity-check-are-distinct-detail-strings", async (t) => {
  const home = tmp(t);
  const { ctx } = await doctor(home);
  mkdirSync(ctx.project.projectDir, { recursive: true });
  const db = new DatabaseSync(ctx.project.dbPath);
  db.exec("PRAGMA user_version = 999;"); // stale schema
  db.close();
  const stale = (await doctor(home)).rows.find((r) => r.id === "D8");
  assert.equal(stale.status, "FAIL");
  assert.match(stale.detail, /stale schema/);

  // Not a database: integrity cause, healed by recreate (no other owner proof) -> distinct text.
  rmSync(ctx.project.dbPath, { force: true });
  writeFileSync(ctx.project.dbPath, "x".repeat(4096), "utf8");
  const corrupt = (await doctor(home)).rows.find((r) => r.id === "D8");
  assert.ok(!corrupt.detail.includes("stale schema"), corrupt.detail);
  assert.match(corrupt.detail, /healed/);
});

test("[M5] doctor/D9-empty-index-is-not-FAIL", async (t) => {
  const { rows } = await doctor(tmp(t));
  const d9 = rows.find((r) => r.id === "D9");
  assert.equal(d9.status, "PASS");
  assert.equal(d9.detail, "0 sources, 0 chunks indexed");
});

test("[M5] doctor/D5b-double-fire-detected", async (t) => {
  const home = tmp(t);
  put(path.join(home, ".claude", "settings.json"), { hooks: { PreToolUse: [{ matcher: "Bash", hooks: [] }] } });
  put(path.join(home, ".vscode", "settings.json"), '{ "chat.useClaudeHooks": true }');
  const d5b = (await doctor(home)).rows.find((r) => r.id === "D5b");
  assert.equal(d5b.status, "FAIL");
});

test("[M5] doctor/codex-effective-hooks-state-no-features-hooks-key-means-true (#1153 #1152)", async (t) => {
  const home = tmp(t);
  const row = getAdapter("codex");
  const hooks = {};
  for (const [canonical, native] of Object.entries(row.eventMap)) {
    const group = { hooks: [{ type: "command", command: "node /opt/cm/hook.mjs --agent codex", timeout: 5 }] };
    if (canonical === "PreToolUse" || canonical === "PostToolUse") group.matcher = composeMatcher(row, canonical);
    hooks[native] = [group];
  }
  put(path.join(home, ".codex", "hooks.json"), { hooks });
  // JSON string escapes are TOML basic-string escapes: a Windows path keeps its backslashes (D-M3-F-9 rule).
  const serverArgs = JSON.stringify([path.join(path.dirname(process.argv[1] ?? ""), "server.mjs"), "--agent", "codex"]);
  put(path.join(home, ".codex", "config.toml"), `model = "o1"\n\n[mcp_servers.context-mode]\ncommand = "node"\nargs = ${serverArgs}\nomit_tools_from = ["deferred"]\ndefault_tools_approval_mode = "approve"\n`);
  const d3 = (await doctor(home, "codex")).rows.find((r) => r.id === "D3");
  assert.equal(d3.status, "PASS", d3.detail);
});

test("[D-N6-CODEX-HOME-2] doctor/D5 looks for codex hooks.json under CODEX_HOME when it is set", async (t) => {
  const home = tmp(t);
  const codexDir = path.join(home, "codex-home");
  put(path.join(codexDir, "hooks.json"), { hooks: {} });
  const d5 = (await doctor(home, "codex", { CODEX_HOME: codexDir })).rows.find((r) => r.id === "D5");
  assert.equal(d5.status, "UNKNOWN");
  assert.equal(d5.detail, C.D5_CODEX_UNTRUSTED_DETAIL);
  const d5home = (await doctor(home, "codex")).rows.find((r) => r.id === "D5");
  assert.notEqual(d5home.detail, C.D5_CODEX_UNTRUSTED_DETAIL);
});

test("[M5] doctor/user-hook-timeout-kept (doctor reads, never rewrites settings.json)", async (t) => {
  const home = tmp(t);
  const file = path.join(home, ".claude", "settings.json");
  const body = JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ timeout: 45 }] }] } });
  put(file, body);
  await doctor(home);
  const { readFileSync } = await import("node:fs");
  assert.equal(readFileSync(file, "utf8"), body);
});

test("[M5] doctor/handler-never-isError and no baked paths in the report", async (t) => {
  const home = tmp(t);
  const reply = await ctxDoctor.handler({}, ctxFor(home));
  assert.equal(reply.isError, false);
  assert.ok(reply.text.includes("D10"));
  assert.equal(reply.sandboxBytes, Buffer.byteLength(reply.text, "utf8"));
  assert.ok(!reply.text.includes("/Users/") || reply.text.includes(home), "any path shown must be the live resolved path");
  assert.equal(ctxDoctor.schema.safeParse({ x: 1 }).success, false, "unknown key rejected");
});

test("[M7] doctor/cli-command: the ctx_doctor report prints the exact context-mode command to run (ADR-0019 D7)", async (t) => {
  const home = tmp(t);
  const reply = await ctxDoctor.handler({}, ctxFor(home, "codex"));
  assert.match(reply.text, /^Run in a terminal: context-mode (doctor|setup) --agents codex$/m);
  if (reply.text.includes("| FAIL |")) assert.match(reply.text, /context-mode setup --agents codex/);
  assert.ok(Buffer.byteLength(reply.text, "utf8") <= 4096, "report stays within REPORT_CAP");
});
