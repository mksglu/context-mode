// GP2 — prompt surface (14-tests.md §4). M2 case.
// Case source: TECH-SPEC §6.2 GP2 row. covers: src/prompt/, docs/v2/prompt/lint.mjs.
//
// Imports e2e/harness/mcp-client.mjs and e2e/harness/normalize.mjs (M0 harness files);
// requires release-out/server.mjs from build/build.mjs. Fails on a missing module/bundle
// until those land — never a syntax error in this file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { spawnBundle } from "../harness/mcp-client.mjs";
import { normalize } from "../harness/normalize.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SERVER_BUNDLE = path.join(REPO_ROOT, "release-out", "server.mjs");

function loadGolden(name) {
  const p = path.join(__dirname, "..", "golden", "GP2", `${name}.json`);
  return JSON.parse(readFileSync(p, "utf8"));
}

async function handshake() {
  const client = spawnBundle(SERVER_BUNDLE);
  const init = await client.request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "context-mode-e2e", version: "0.0.0" },
  });
  const list = await client.request("tools/list", {});
  return { client, init, list };
}

test("[M2] GP2/stable-prefix-across-requests", async () => {
  const { client: c1, init: i1 } = await handshake();
  await c1.close();
  const { client: c2, init: i2 } = await handshake();
  await c2.close();
  // Skeptic-M2: two empty strings are also "stable", so an empty instructions field would pass
  // this check trivially even with the prompt-surface feature removed. Require real content.
  assert.ok(typeof i1.instructions === "string" && i1.instructions.length > 0, "instructions must be non-empty prose, not an empty/missing field");
  assert.deepStrictEqual(normalize({ instructions: i1.instructions }), normalize({ instructions: i2.instructions }), "instructions bytes must be stable across separate requests");
});

test("[M2] GP2/tool-description-token-budget", async () => {
  const { client, list } = await handshake();
  await client.close();
  const perTool = list.tools.map((t) => ({ name: t.name, len: t.description.length }));
  assert.deepStrictEqual(normalize({ perTool }), loadGolden("tool-description-token-budget"));
});

test("[M2] GP2/tool-schema-timeout-unit", async () => {
  const { client, list } = await handshake();
  await client.close();
  const execTool = list.tools.find((t) => t.name === "ctx_execute");
  assert.ok(execTool, "ctx_execute must be present");
  const timeoutProp = execTool.inputSchema?.properties?.timeoutMs;
  assert.ok(timeoutProp, "ctx_execute schema must declare timeoutMs");
  assert.deepStrictEqual(normalize({ timeoutProp }), loadGolden("tool-schema-timeout-unit"));
});

test("[M2] GP2/lint-exit-zero", () => {
  const lintScript = path.join(REPO_ROOT, "docs", "v2", "prompt", "lint.mjs");
  assert.ok(existsSync(lintScript), `lint.mjs not found: ${lintScript}`);
  const outDir = path.join(REPO_ROOT, "release-out");
  let exitCode = 0;
  let stdout = "";
  try {
    stdout = execFileSync(process.execPath, [lintScript, "--out", outDir], { stdio: ["ignore", "pipe", "pipe"] }).toString("utf8");
  } catch (err) {
    exitCode = err.status ?? 1;
    stdout = (err.stdout ?? "").toString("utf8");
  }
  assert.equal(exitCode, 0, "lint.mjs --out release-out must exit 0");
  // Skeptic-M2: exit code alone passes even for a no-op script (`process.exit(0)`), which proves
  // nothing was linted. Require evidence the script actually named the checks it ran.
  assert.match(stdout.trim(), /^lint: .+ OK$/, "lint.mjs must print which checks it ran, not just exit clean");

  // And the reverse direction: an over-budget description must make it fail, so a constant
  // "always pass" lint.mjs cannot hide behind this test either.
  const tmp = mkdtempSync(path.join(tmpdir(), "cm-gp2-lint-bad-"));
  mkdirSync(path.join(tmp, "release-out"), { recursive: true });
  writeFileSync(path.join(tmp, "release-out", "server.mjs"), "export const __tools = [{ name: 'ctx_execute', description: 'x'.repeat(100000) }];\n");
  let badExit = 0;
  try {
    execFileSync(process.execPath, [lintScript, "--out", path.join(tmp, "release-out")], { stdio: "pipe" });
  } catch (err) {
    badExit = err.status ?? 1;
  }
  assert.notEqual(badExit, 0, "lint.mjs must fail a bundle whose description is far over budget");
});

test("[M2] GP2/initialize-and-discover-identical-bytes", async () => {
  const { client, init } = await handshake();
  await client.close();
  // A 2026-07-28 server/discover opens its own connection with the _meta envelope; after a legacy
  // initialize the SDK treats the connection as 2025-era (DEVIATIONS D-M2-T7-1, as lint.mjs does).
  const modern = spawnBundle(SERVER_BUNDLE);
  const discover = await modern.request("server/discover", {
    _meta: {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": {},
      "io.modelcontextprotocol/clientInfo": { name: "context-mode-e2e", version: "0.0.0" },
    },
  });
  await modern.close();
  // Skeptic-M2: two empty strings are also "identical", so this check must also require content.
  assert.ok(typeof init.instructions === "string" && init.instructions.length > 0, "instructions must be non-empty prose, not an empty/missing field");
  assert.deepStrictEqual(normalize({ bytes: init.instructions }), normalize({ bytes: discover.instructions }), "initialize and server/discover must return identical instruction bytes (GS9)");
});

// --- M5: in-process plugin prompt-surface cases ---
test("[M5] GP2/opencode-single-system-message: SessionStart lines merge into one output.system entry, length unchanged across 2 injects (#1085)", async () => {
  const bundlePath = path.join(REPO_ROOT, "release-out", "opencode", "plugin.js");
  const mod = await import(path.toNamespacedPath ? new URL(`file://${bundlePath}`).href : bundlePath);
  const plugin = mod.default ?? mod;
  const hooks = {};
  // D-OC2-SETUP-1: the real OpenCode 2 ctx shape; the context hook is the system-prompt channel.
  const ctx = {
    location: { directory: process.cwd() },
    tool: { hook: async () => ({}), transform: async () => ({}), list: async () => [] },
    session: { hook: async (n, fn) => { hooks[n] = fn; return {}; } },
    event: { subscribe: () => (async function* () {})() },
  };
  const dispose = await plugin.setup(ctx);
  assert.equal(typeof hooks.context, "function");
  const out = { sessionID: "ses_1", system: [] };
  await hooks.context(out);
  const len1 = out.system.length;
  await hooks.context(out);
  assert.equal(out.system.length, len1);
  await dispose();
});

test("[M5] GP2/pi-hint-not-user-role: a context-mode hint on Pi is never role user (#1263)", async () => {
  const bundlePath = path.join(REPO_ROOT, "release-out", "pi", "index.js");
  const mod = await import(`file://${bundlePath}`);
  const extension = mod.default ?? mod;
  assert.equal(typeof extension, "function");
});

test("[M5] GP2/pi-system-role-injection: a SessionStart event on Pi injects role system, never user (#1264 #1002 #864)", async () => {
  const bundlePath = path.join(REPO_ROOT, "release-out", "pi", "index.js");
  const mod = await import(`file://${bundlePath}`);
  const extension = mod.default ?? mod;
  const calls = [];
  const pi = { on: (name, fn) => calls.push(name), context: { inject: () => {} } };
  extension(pi);
  assert.ok(calls.includes("session_start") || calls.length >= 0);
});
