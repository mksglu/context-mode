// README agent tables come from the adapter table (src/adapters/table.ts) and the setup registry
// (src/setup/registry.ts). build/readme-agents.mjs renders them; build/check-readme.mjs fails when the README
// copy differs (D-README-1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { agentRows, renderAgentTables, checkAgentTables, MARKERS, HOOK_WORDS } from "../../../build/readme-agents.mjs";
import { ADAPTERS } from "../../../src/adapters/table.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const README = readFileSync(path.join(REPO, "README.md"), "utf8");

test("readme-agents: one row per adapter, sorted by name", () => {
  const rows = agentRows();
  assert.deepEqual(rows.map((r) => r.id).sort(), ADAPTERS.map((a) => a.id).sort());
  const names = rows.map((r) => r.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
});

test("readme-agents: every host row says it has hooks, from its hookChannel in table.ts", () => {
  const rows = agentRows();
  assert.equal(rows.length, 10);
  for (const r of rows) {
    const a = ADAPTERS.find((x) => x.id === r.id);
    assert.ok(a.hookChannel, `${r.id} has a hookChannel`);
    assert.ok(r.hooks.startsWith("yes"), `${r.id} hooks cell: ${r.hooks}`);
    assert.ok(r.hooks.includes(HOOK_WORDS[a.hookChannel.kind]), `${r.id} hooks cell names the ${a.hookChannel.kind} channel: ${r.hooks}`);
    assert.equal(r.skills, "yes", r.id);
    assert.ok(r.install.length > 0, r.id);
  }
});

test("readme-agents: the table has the columns Agent | Hooks | MCP | Skills | Install | Guide and never says MCP only", () => {
  const header = "| Agent | Hooks | MCP | Skills | Install | Guide |";
  assert.ok(renderAgentTables().install.startsWith(header), renderAgentTables().install.split("\n")[0]);
  assert.ok(README.includes(header));
  for (const text of [README, renderAgentTables().install]) {
    assert.ok(!text.includes("MCP only"), "the words MCP only are gone");
    assert.ok(!text.includes("| full |"), "no full label");
  }
  assert.ok(!readFileSync(path.join(REPO, "docs", "install", "README.md"), "utf8").includes("MCP only"));
  assert.ok(!readFileSync(path.join(REPO, "src", "cli", "commands.ts"), "utf8").includes("MCP only"));
});

test("readme-agents: install cell is the page's native command, or npm + context-mode setup", () => {
  const by = Object.fromEntries(agentRows().map((r) => [r.id, r.install]));
  assert.ok(by["claude-code"].includes("claude plugin install"), by["claude-code"]);
  assert.ok(by.codex.includes("codex plugin add"), by.codex);
  assert.ok(by.gemini.includes("gemini extensions install"), by.gemini);
  assert.ok(by.pi.includes("pi install"), by.pi);
  for (const id of ["copilot-cli", "kiro", "vscode", "zcode"]) assert.ok(by[id].includes("context-mode setup"), by[id]);
});

test("readme-agents: the README holds the rendered tables between the markers", () => {
  assert.deepEqual(checkAgentTables(README), []);
  for (const [start, end] of Object.values(MARKERS)) {
    assert.equal(README.split(start).length - 1, 1, `README has ${start} once`);
    assert.equal(README.split(end).length - 1, 1, `README has ${end} once`);
  }
});

test("readme-agents: a hand edit or a missing block fails the check", () => {
  const tables = renderAgentTables();
  const edited = README.replace("| Codex | yes", "| Codex | no");
  assert.notEqual(edited, README, "fixture edit did not apply");
  assert.ok(checkAgentTables(edited).some((p) => p.includes("install")), checkAgentTables(edited).join("\n"));
  const missing = README.split(MARKERS.install[0]).join("");
  assert.ok(checkAgentTables(missing).some((p) => p.includes("install")), checkAgentTables(missing).join("\n"));
  assert.ok(tables.install.includes("(docs/install/codex.md#install)") && !("upgrade" in tables));
});
