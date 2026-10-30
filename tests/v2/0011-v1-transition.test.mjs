// ADR-0011, GP11: the v1 to v2 transition. Detect v1 footprints, remove them, plant them in e2e setup, and the
// merge-traffic script. One file per area (docs/v2/TEST-LAYOUT.md).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { detectV1 } from "../../src/core/ops/detect-v1.ts";
import { UPGRADE_REPORT_ONLY_REASONS, UPGRADE_NOT_FOUND, UPGRADE_REMOVED, UPGRADE_REPORT_ONLY, UPGRADE_TRASH_SUFFIX, V1_REASON } from "../../src/core/contracts/constants.ts";
import { removeV1 } from "../../src/core/ops/v1-remove.ts";
import { execFileSync, spawnSync } from "node:child_process";
import { AGENT_IDS as SETUP_AGENT_IDS, plantV1Install, v1GlobalBin, v1NpmBinDir, v1NpmPrefix, v1Project } from "../../e2e/live/cases/v1-migration-setup.mjs";
import { AGENT_IDS } from "../../src/core/contracts/agents.ts";
import { fileURLToPath } from "node:url";

describe("ADR-0011: detect v1", { concurrency: true }, () => {
  // Spec: docs/v2/impl/07-tools-ops.md (exports detectV1). ADR-0011 "v1 cleanup": finds leftover
  // v1 entries (files/config keys) so ctx_upgrade can remove them. Signature per impl/07 §3
  // detectV1(agent, home) plus the optional scope (DEVIATIONS D-M5-O2-1); scope.tmp is an empty dir
  // so a real machine's <os tmp>/context-mode-* files do not leak into these cases.
  function tmp(t) {
    const dir = mkdtempSync(path.join(tmpdir(), "cm-detect-v1-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  test("[M5] detect-v1/finds-legacy-mcp-entry-in-host-config", (t) => {
    const home = tmp(t);
    const dir = path.join(home, ".claude");
    mkdirSync(dir, { recursive: true });
    const settings = path.join(dir, "settings.json");
    writeFileSync(settings, JSON.stringify({ mcpServers: { "context-mode": { command: "node", args: ["v1/server.js"] } } }), "utf8");
    const findings = detectV1("claude-code", home, { tmp: tmp(t) });
    assert.ok(findings.some((f) => f.file === settings), "must report the v1 mcpServers entry");
  });

  test("[M5] detect-v1/no-findings-on-clean-v2-only-config", (t) => {
    const home = tmp(t);
    const dir = path.join(home, ".claude");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ hooks: {} }), "utf8");
    const findings = detectV1("claude-code", home, { tmp: tmp(t) });
    assert.deepEqual(findings, []);
  });

  test("[M5] detect-v1/v1-entries-removed-by-upgrade (GP11 row)", (t) => {
    const home = tmp(t);
    const dir = path.join(home, ".claude");
    mkdirSync(dir, { recursive: true });
    const settings = path.join(dir, "settings.json");
    writeFileSync(settings, JSON.stringify({ mcpServers: { "context-mode": { command: "node" } } }), "utf8");
    const before = detectV1("claude-code", home, { tmp: tmp(t) });
    assert.ok(before.length > 0);
    // The removal itself is exercised end to end by ctx_upgrade (upgrade.test.mjs / GP11 e2e);
    // this unit test only proves detectV1 is the source of truth for "is anything left".
  });

  test("[M5] detect-v1/one-finding-per-match-across-agents (ADR-0011 table)", (t) => {
    const home = tmp(t);
    const project = tmp(t);
    const w = (rel, body) => {
      const f = path.join(rel.startsWith("@") ? project : home, rel.replace(/^@\//, ""));
      mkdirSync(path.dirname(f), { recursive: true });
      writeFileSync(f, typeof body === "string" ? body : JSON.stringify(body), "utf8");
      return f;
    };
    const cc = w(".claude/settings.json", {
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [
          { type: "command", command: "node /x/context-mode/hooks/pretooluse.mjs" },
          { type: "command", command: "my-own-hook" },
        ] }],
        SessionStart: [{ hooks: [{ type: "command", command: "node ~/.claude/hooks/context-mode-cache-heal.mjs" }] }],
      },
      statusLine: { type: "command", command: "context-mode statusline" },
    });
    w(".claude/hooks/context-mode-cache-heal.sh", "#!/bin/sh\n");
    const userCfg = w(".claude.json", { mcpServers: { "context-mode": { command: "context-mode" }, other: {} } });
    const ccF = detectV1("claude-code", home, { tmp: tmp(t) });
    assert.deepEqual(ccF.map((f) => [f.file === cc || f.file === userCfg ? "cfg" : "file", f.path]).sort(), [
      ["cfg", "hooks.PreToolUse.0.hooks.0"], ["cfg", "hooks.SessionStart.0.hooks.0"], ["cfg", "mcpServers.context-mode"],
      ["cfg", "statusLine"], ["file", ""],
    ]);
    for (const f of ccF) assert.ok(f.reason.length > 0);

    w(".codex/hooks.json", { hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "context-mode hook codex pretooluse" }] }],
      Stop: [{ hooks: [{ type: "command", command: "node /a/hooks/codex/stop.mjs" }] }] } });
    w(".codex/config.toml", "[features]\nhooks = true\n\n[mcp_servers.context-mode]\ncommand = \"context-mode\"\n");
    assert.deepEqual(detectV1("codex", home, { tmp: tmp(t) }).map((f) => f.path),
      ["hooks.PreToolUse.0.hooks.0", "hooks.Stop.0.hooks.0", "[mcp_servers.context-mode]"]);

    w(".kiro/agents/default.json", { hooks: { preToolUse: [{ matcher: "*", command: "context-mode hook kiro pretooluse" }, { command: "x" }] } });
    assert.deepEqual(detectV1("kiro", home, { tmp: tmp(t) }).map((f) => f.path), ["hooks.preToolUse.0"]);

    w(".copilot/hooks/context-mode.json", { version: 1, hooks: { preToolUse: [{ type: "command", command: "context-mode hook copilot-cli pretooluse" }] } });
    assert.equal(detectV1("copilot-cli", home, { tmp: tmp(t) }).length, 1);

    w("@/.github/hooks/context-mode.json", { version: 1, hooks: { preToolUse: [{ type: "command", command: "context-mode hook vscode-copilot pretooluse" }] } });
    w("@/.vscode/mcp.json", "{\n  // v1\n  \"servers\": { \"context-mode\": { \"command\": \"context-mode\" }, },\n}\n");
    assert.deepEqual(detectV1("vscode", home, { project, tmp: tmp(t) }).map((f) => f.path), ["", "servers.context-mode"]);

    w(".config/opencode/opencode.jsonc", "{ \"plugin\": [\"a\", \"context-mode\", \"b\"] }");
    assert.deepEqual(detectV1("opencode", home, { tmp: tmp(t) }).map((f) => f.path), ["plugin.1"]);

    w(".zcode/cli/config.json", { hooks: { enabled: true, events: { PreToolUse: [{ type: "command", command: "context-mode hook zcode pretooluse" }] } } });
    assert.deepEqual(detectV1("zcode", home, { tmp: tmp(t) }).map((f) => f.path), ["hooks.events.PreToolUse.0"]);

    w(".gemini/settings.json", { hooks: { BeforeTool: [{ hooks: [{ type: "command", command: "context-mode hook gemini-cli beforetool" }] }] } });
    mkdirSync(path.join(home, ".gemini", "context-mode"), { recursive: true });
    assert.equal(detectV1("gemini", home, { tmp: tmp(t) }).length, 2);
  });

  test("[M5] detect-v1/pi-npm-entry-found-via-PI_CODING_AGENT_DIR and after the git entry (#1035, #901)", (t) => {
    const home = tmp(t);
    const piDir = tmp(t);
    writeFileSync(path.join(piDir, "settings.json"),
      JSON.stringify({ packages: ["git:github.com/mksglu/context-mode@release", "npm:context-mode"] }), "utf8");
    assert.deepEqual(detectV1("pi", home, { piAgentDir: piDir, tmp: tmp(t) }).map((f) => f.path), ["packages.1"]);
    assert.deepEqual(detectV1("pi", home, { tmp: tmp(t) }), [], "default <home>/.pi/agent has nothing");
  });

  test("[M5] detect-v1/All-row: v1 content under ~/.context-mode and context-mode-* temp files; v2 data is not v1", (t) => {
    const home = tmp(t);
    const tdir = tmp(t);
    mkdirSync(path.join(home, ".context-mode", "projects", "abc"), { recursive: true });
    assert.deepEqual(detectV1("codex", home, { tmp: tdir }), [], "v2 projects/ dir is not a v1 leftover");
    mkdirSync(path.join(home, ".context-mode", "content"), { recursive: true });
    writeFileSync(path.join(tdir, "context-mode-mcp-ready-1"), "", "utf8");
    const all = detectV1("codex", home, { tmp: tdir });
    assert.deepEqual(all.map((f) => f.path), ["", "context-mode-*"]);
  });

  test("[M5] detect-v1/never-writes and never throws on broken files", (t) => {
    const home = tmp(t);
    mkdirSync(path.join(home, ".claude"), { recursive: true });
    writeFileSync(path.join(home, ".claude", "settings.json"), "{ not json", "utf8");
    const before = readdirSync(home, { recursive: true }).sort();
    assert.deepEqual(detectV1("claude-code", home, { tmp: tmp(t) }), []);
    assert.deepEqual(readdirSync(home, { recursive: true }).sort(), before);
  });
});

describe("ADR-0011: detect v1 on kiro", { concurrency: true }, () => {
  // Spec: DECISIONS-r4 A37, DEVIATIONS D-M7-V2-2. scanKiro currently reads only agents/default.json
  // (src/core/ops/detect-v1.ts); A37 asks for a wildcard scan over ~/.kiro/agents/*.json for any file
  // whose top-level `name` is "context-mode", plus a report-only (never deleted) flag for
  // .kiro/steering/KIRO.md. This test is red until the tools-ops owner adds both A37 findings.
  function tmp(t) {
    const dir = mkdtempSync(path.join(tmpdir(), "cm-detect-v1-kiro-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  test("[M7] detect-v1-kiro/scans-every-agents-json-not-only-default (A37)", (t) => {
    const home = tmp(t);
    const agentsDir = path.join(home, ".kiro", "agents");
    mkdirSync(agentsDir, { recursive: true });
    // A non-default file name: A37 says "scan ~/.kiro/agents/*.json", not just default.json.
    const other = path.join(agentsDir, "work.json");
    writeFileSync(other, JSON.stringify({ name: "context-mode", command: "node", args: ["v1/server.js"] }), "utf8");
    const findings = detectV1("kiro", home, { tmp: tmp(t) });
    assert.ok(findings.some((f) => f.file === other), "must report a v1 entry found in a non-default agents/*.json file");
  });

  test("[M7] detect-v1-kiro/flags-steering-doc-report-only-never-deleted (A37)", (t) => {
    const home = tmp(t);
    const steeringDir = path.join(home, ".kiro", "steering");
    mkdirSync(steeringDir, { recursive: true });
    const steering = path.join(steeringDir, "KIRO.md");
    writeFileSync(steering, "# v1 steering doc\n", "utf8");
    const findings = detectV1("kiro", home, { tmp: tmp(t) });
    const flagged = findings.find((f) => f.file === steering);
    assert.ok(flagged, "must flag .kiro/steering/KIRO.md for manual review");
    // impl/07 §3: V1Finding is {file, path, reason}; report-only is the reason being in UPGRADE_REPORT_ONLY_REASONS
    // (removeV1 leaves those files untouched). DEVIATION in the M7-K1 commit body.
    assert.ok(UPGRADE_REPORT_ONLY_REASONS.includes(flagged.reason), "the steering-doc finding must be report-only, never auto-deleted");
  });

  test("[M7] detect-v1-kiro/no-finding-when-name-does-not-match-context-mode (A37)", (t) => {
    const home = tmp(t);
    const agentsDir = path.join(home, ".kiro", "agents");
    mkdirSync(agentsDir, { recursive: true });
    const other = path.join(agentsDir, "unrelated.json");
    writeFileSync(other, JSON.stringify({ name: "some-other-tool", command: "node" }), "utf8");
    const findings = detectV1("kiro", home, { tmp: tmp(t) });
    assert.ok(!findings.some((f) => f.file === other), "an agents/*.json file with a different name must not be flagged");
  });
});

describe("ADR-0011: remove v1", { concurrency: true }, () => {
  // Spec: docs/v2/impl/07-tools-ops.md §6 step 6, ADR-0011 "v1 cleanup", DEVIATIONS D-M5-U1-4/5, D-M5-U6-1..3.
  // removeV1(agent, findings) -> { rows, commit, rollback }: one UpgradeChangeRow per finding; remove rows
  // delete the file or strip the entry; report-only rows leave the file untouched and carry the fix text.
  function tmp(t) {
    const dir = mkdtempSync(path.join(tmpdir(), "cm-v1-remove-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }
  function put(file, body) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, typeof body === "string" ? body : JSON.stringify(body, null, 2), "utf8");
    return file;
  }
  const json = (file) => JSON.parse(readFileSync(file, "utf8"));

  test("[M5] v1-remove/strips-v1-mcp-entry-keeps-user-keys (GP11 v1-entries-removed)", (t) => {
    const home = tmp(t);
    const file = put(path.join(home, ".claude", "settings.json"), {
      mcpServers: { "context-mode": { command: "node", args: ["v1/server.js"] }, mine: { command: "x" } },
      hooks: { PreToolUse: [{ matcher: "Foo", hooks: [{ type: "command", command: "my-user-hook" }] }] },
    });
    const findings = detectV1("claude-code", home, { tmp: tmp(t) });
    const r = removeV1("claude-code", findings);
    assert.equal(r.rows.length, findings.length);
    assert.deepEqual(r.rows, [{ area: `${file}: mcpServers.context-mode`, before: V1_REASON.mcpEntry, after: UPGRADE_REMOVED }]);
    const after = json(file);
    assert.equal(after.mcpServers["context-mode"], undefined);
    assert.deepEqual(after.mcpServers.mine, { command: "x" });
    assert.equal(after.hooks.PreToolUse[0].hooks[0].command, "my-user-hook");
    assert.ok(existsSync(file + UPGRADE_TRASH_SUFFIX), "original kept until commit");
    r.commit();
    assert.ok(!existsSync(file + UPGRADE_TRASH_SUFFIX));
  });

  test("[M5] v1-remove/report-only-rows-untouched-with-fix-text (D-M5-U1-4, D-M5-U1-5)", (t) => {
    const home = tmp(t);
    const tdir = tmp(t);
    const body = { statusLine: { type: "command", command: "context-mode statusline" } };
    const file = put(path.join(home, ".claude", "settings.json"), body);
    put(path.join(tdir, "context-mode-abc.db"), "x");
    const before = readFileSync(file, "utf8");
    const findings = detectV1("claude-code", home, { tmp: tdir });
    const r = removeV1("claude-code", findings);
    assert.deepEqual(r.rows.map((x) => [x.before, x.after]), [
      [V1_REASON.statusLine, UPGRADE_REPORT_ONLY],
      [V1_REASON.tmpFile, UPGRADE_REPORT_ONLY],
    ]);
    assert.equal(readFileSync(file, "utf8"), before);
    assert.ok(existsSync(path.join(tdir, "context-mode-abc.db")));
    assert.ok(!existsSync(file + UPGRADE_TRASH_SUFFIX));
  });

  test("[M5] v1-remove/vscode-mcp-and-gemini-shared-data-are-report-only", () => {
    const rows = removeV1("gemini", [
      { file: "/nope/.vscode/mcp.json", path: "servers.context-mode", reason: V1_REASON.vscodeMcp },
      { file: "/nope/.gemini/context-mode", path: "", reason: V1_REASON.dataDirShared },
    ]).rows;
    assert.deepEqual(rows.map((x) => x.after), [UPGRADE_REPORT_ONLY, UPGRADE_REPORT_ONLY]);
    assert.equal(rows[1].area, "/nope/.gemini/context-mode");
  });

  test("[M5] v1-remove/whole-file-and-hook-entry-removed-then-rollback-restores", (t) => {
    const home = tmp(t);
    const heal = put(path.join(home, ".claude", "hooks", "context-mode-cache-heal.mjs"), "// v1");
    const original = {
      hooks: {
        PreToolUse: [{ matcher: "", hooks: [{ type: "command", command: "node /x/context-mode/hooks/pretooluse.mjs" }, { type: "command", command: "mine" }] }],
      },
    };
    const file = put(path.join(home, ".claude", "settings.json"), original);
    const text = readFileSync(file, "utf8");
    const findings = detectV1("claude-code", home, { tmp: tmp(t) });
    const r = removeV1("claude-code", findings);
    assert.deepEqual(r.rows.map((x) => x.after), [UPGRADE_REMOVED, UPGRADE_REMOVED]);
    assert.ok(!existsSync(heal));
    assert.deepEqual(json(file).hooks.PreToolUse[0].hooks, [{ type: "command", command: "mine" }]);
    r.rollback();
    assert.equal(readFileSync(heal, "utf8"), "// v1");
    assert.equal(readFileSync(file, "utf8"), text);
    assert.ok(!existsSync(heal + UPGRADE_TRASH_SUFFIX) && !existsSync(file + UPGRADE_TRASH_SUFFIX));
  });

  test("[M5] v1-remove/codex-toml-section-cut-other-tables-kept", (t) => {
    const home = tmp(t);
    const file = put(path.join(home, ".codex", "config.toml"),
      "[features]\nhooks = true\n\n[mcp_servers.context-mode]\ncommand = \"context-mode\"\n\n[mcp_servers.other]\ncommand = \"o\"\n");
    const findings = detectV1("codex", home, { tmp: tmp(t) });
    const r = removeV1("codex", findings);
    assert.deepEqual(r.rows, [{ area: `${file}: [mcp_servers.context-mode]`, before: V1_REASON.codexToml, after: UPGRADE_REMOVED }]);
    const after = readFileSync(file, "utf8");
    assert.ok(!after.includes("context-mode"));
    assert.ok(after.includes("[features]") && after.includes("[mcp_servers.other]") && after.includes("command = \"o\""));
    r.commit();
  });

  test("[M5] v1-remove/pi-npm-entries-dropped-git-entry-kept-jsonc-comments-kept", (t) => {
    const home = tmp(t);
    const file = put(path.join(home, ".pi", "agent", "settings.json"),
      "{\n  // my note\n  \"packages\": [\"npm:context-mode\", \"npm:other\", {\"source\": \"npm:context-mode\"}, \"git:github.com/mksglu/context-mode@release\"],\n  \"theme\": \"dark\"\n}\n");
    const findings = detectV1("pi", home, { tmp: tmp(t) });
    assert.equal(findings.length, 2);
    const r = removeV1("pi", findings);
    assert.deepEqual(r.rows.map((x) => x.after), [UPGRADE_REMOVED, UPGRADE_REMOVED]);
    const text = readFileSync(file, "utf8");
    assert.ok(text.includes("// my note"));
    assert.ok(text.includes("\"theme\": \"dark\""));
    assert.ok(text.includes("npm:other") && text.includes("git:github.com/mksglu/context-mode@release"));
    assert.ok(!text.includes("npm:context-mode"));
    r.commit();
  });

  test("[M5] v1-remove/gone-before-removal-is-not-found", (t) => {
    const home = tmp(t);
    const r = removeV1("claude-code", [
      { file: path.join(home, "gone.json"), path: "mcpServers.context-mode", reason: V1_REASON.mcpEntry },
      { file: path.join(home, "gone.mjs"), path: "", reason: V1_REASON.cacheHealFile },
    ]);
    assert.deepEqual(r.rows.map((x) => x.after), [UPGRADE_NOT_FOUND, UPGRADE_NOT_FOUND]);
  });

  test("[M5] v1-remove/no-findings-no-rows", () => {
    assert.deepEqual(removeV1("claude-code", []).rows, []);
  });
});

describe("GP11: v1 migration setup plants detectable footprints", { concurrency: true }, () => {
  // Spec: docs/v2/impl/15-v1-transition.md §3.1, §7 A3; ADR-0011 "v1 cleanup" table and "Facts";
  // DECISIONS-r4 A37 (Kiro agents/*.json + steering KIRO.md), B28 (VS Code session dirs + .vscode/mcp.json);
  // DEVIATIONS D-M7-arch-6 (temp npm prefix with a fake global bin). The planted footprint is proved
  // against detectV1 (impl/07 §3), the same reader ctx_doctor's D4 row and ctx_upgrade use.
  function tmp(t, tag) {
    const dir = mkdtempSync(path.join(tmpdir(), `cm-v1-setup-${tag}-`));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  function scan(t, agent, home) {
    const emptyTmp = tmp(t, "ostmp");
    return detectV1(agent, home, { project: v1Project(home), tmp: emptyTmp });
  }

  // Per agent: the V1_REASON texts detectV1 must report after planting (ADR-0011 rows).
  const EXPECTED = {
    "claude-code": [V1_REASON.hook, V1_REASON.mcpEntry, V1_REASON.dataDir],
    codex: [V1_REASON.codexHook, V1_REASON.codexToml, V1_REASON.dataDir],
    gemini: [V1_REASON.hook, V1_REASON.dataDirShared],
    qwen: [V1_REASON.hook, V1_REASON.dataDir],
    "copilot-cli": [V1_REASON.hookFile, V1_REASON.dataDir],
    vscode: [V1_REASON.hookFile, V1_REASON.vscodeMcp, V1_REASON.dataDir],
    kiro: [V1_REASON.kiroHook, V1_REASON.dataDir],
    pi: [V1_REASON.piNpm, V1_REASON.dataDir],
    opencode: [V1_REASON.opencodePlugin],
    zcode: [V1_REASON.zcodeHook],
  };

  test("[M7] v1-migration-setup/own-agent-list-matches-AGENT_IDS", () => {
    assert.deepEqual([...SETUP_AGENT_IDS].sort(), [...AGENT_IDS].sort());
  });

  for (const agent of AGENT_IDS) {
    test(`[M7] v1-migration-setup/plants-detectable-v1-footprint/${agent}`, (t) => {
      const home = tmp(t, agent);
      assert.equal(scan(t, agent, home).length, 0, "fresh home has no v1 footprint");
      const ret = plantV1Install(agent, home);
      assert.equal(ret, undefined, "impl/15 §3.1: returns nothing");
      const reasons = new Set(scan(t, agent, home).map((f) => f.reason));
      for (const r of EXPECTED[agent]) assert.ok(reasons.has(r), `${agent}: missing finding "${r}"`);
    });
  }

  test("[M7] v1-migration-setup/claude-code-mcp-entry-in-home-claude-json", (t) => {
    const home = tmp(t, "cc");
    plantV1Install("claude-code", home);
    const doc = JSON.parse(readFileSync(path.join(home, ".claude.json"), "utf8"));
    assert.ok(doc.mcpServers["context-mode"]);
    const settings = readFileSync(path.join(home, ".claude", "settings.json"), "utf8");
    assert.ok(settings.includes("context-mode hook"));
  });

  test("[M7] v1-migration-setup/codex-keeps-features-hooks", (t) => {
    const home = tmp(t, "codex");
    plantV1Install("codex", home);
    const toml = readFileSync(path.join(home, ".codex", "config.toml"), "utf8");
    assert.ok(toml.includes("[features]") && toml.includes("hooks = true"));
    assert.ok(toml.includes("[mcp_servers.context-mode]"));
  });

  test("[M7] v1-migration-setup/vscode-both-session-dirs-non-empty (B28)", (t) => {
    const home = tmp(t, "vscode");
    plantV1Install("vscode", home);
    const projectSessions = path.join(v1Project(home), ".github", "context-mode", "sessions");
    const homeSessions = path.join(home, ".vscode", "context-mode", "sessions");
    for (const dir of [projectSessions, homeSessions]) assert.ok(readdirSync(dir).length > 0, dir);
    const findings = scan(t, "vscode", home).filter((f) => f.reason === V1_REASON.dataDir).map((f) => f.file);
    assert.ok(findings.includes(projectSessions) && findings.includes(homeSessions));
  });

  test("[M7] v1-migration-setup/kiro-agent-name-and-steering-doc (A37)", (t) => {
    const home = tmp(t, "kiro");
    plantV1Install("kiro", home);
    const agentsDir = path.join(home, ".kiro", "agents");
    const named = readdirSync(agentsDir)
      .filter((n) => n.endsWith(".json"))
      .map((n) => JSON.parse(readFileSync(path.join(agentsDir, n), "utf8")))
      .filter((d) => d.name === "context-mode");
    assert.equal(named.length, 1);
    assert.ok(!Array.isArray(named[0].hooks) && typeof named[0].hooks === "object", "flat hooks object");
    assert.ok(existsSync(path.join(v1Project(home), ".kiro", "steering", "KIRO.md")));
  });

  test("[M7] v1-migration-setup/fake-global-bin-under-temp-npm-prefix (D-M7-arch-6)", (t) => {
    const home = tmp(t, "bin");
    plantV1Install("copilot-cli", home);
    const win = process.platform === "win32";
    const prefix = v1NpmPrefix(home);
    const bin = v1GlobalBin(home);
    // npm's global layout: POSIX prefix/lib/node_modules + prefix/bin/<name>; Windows prefix/node_modules +
    // prefix/<name>.cmd (the bin dir is the prefix itself).
    const binDir = win ? prefix : path.join(prefix, "bin");
    const pkgRoot = win ? path.join(prefix, "node_modules") : path.join(prefix, "lib", "node_modules");
    assert.equal(bin, path.join(binDir, win ? "context-mode.cmd" : "context-mode"));
    assert.equal(v1NpmBinDir(home), binDir, "the dir the case puts first on PATH holds the bin");
    assert.ok(existsSync(path.join(pkgRoot, "context-mode", "package.json")));
    // npm itself agrees on the package root for this prefix (`npm root -g`).
    const npmRoot = execFileSync(win ? "npm.cmd" : "npm", ["root", "-g"], {
      env: { ...process.env, npm_config_prefix: prefix }, encoding: "utf8", shell: win,
    }).trim();
    assert.equal(path.resolve(npmRoot), path.resolve(pkgRoot));
    if (win) assert.ok(readFileSync(bin, "utf8").startsWith("@echo off\r\n"), "bin is a cmd shim");
    else {
      assert.ok(statSync(bin).mode & 0o111, "bin is executable");
      execFileSync(bin, ["hook", "copilot-cli", "pretooluse"], { input: "{}" }); // exit 0 or throws
    }
    // A second agent in the same home reuses the bin (no overwrite, no throw).
    plantV1Install("vscode", home);
    assert.ok(existsSync(bin));
  });

  test("[M7] v1-migration-setup/throws-on-unknown-agent-and-writes-nothing", (t) => {
    const home = tmp(t, "bad");
    assert.throws(() => plantV1Install("cursor", home), /cursor/);
    assert.deepEqual(readdirSync(home), []);
  });

  test("[M7] v1-migration-setup/never-overwrites-an-existing-file", (t) => {
    const home = tmp(t, "keep");
    const dir = path.join(home, ".claude");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "settings.json"), "USER");
    assert.throws(() => plantV1Install("claude-code", home), /EEXIST|exists/);
    assert.equal(readFileSync(path.join(dir, "settings.json"), "utf8"), "USER");
  });
});

describe("ADR-0011: merge-traffic script", { concurrency: true }, () => {
  // Unit tests for scripts/release/merge-traffic.mjs (impl/13 §14.1, ADR-0011 §Metrics,
  // DEVIATIONS D-M6-W1-1). Runs the real script on scratch files.
  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const SCRIPT = path.join(REPO, "scripts", "release", "merge-traffic.mjs");

  const ts = (day) => `2026-10-${String(day).padStart(2, "0")}T00:00:00Z`;
  const days = (from, to, n = 10) => {
    const out = [];
    for (let d = from; d <= to; d++) out.push({ timestamp: ts(d), count: d * n, uniques: d });
    return out;
  };
  const body = (kind, list, count = 999, uniques = 99) => ({ count, uniques, [kind]: list });

  function scratch(t) {
    const dir = mkdtempSync(path.join(tmpdir(), "cm-v2-traffic-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  function run(dir, clones, views, out = path.join(dir, "metrics", "traffic.json")) {
    const c = path.join(dir, "clones.json");
    const v = path.join(dir, "views.json");
    writeFileSync(c, typeof clones === "string" ? clones : JSON.stringify(clones));
    writeFileSync(v, typeof views === "string" ? views : JSON.stringify(views));
    const r = spawnSync(process.execPath, [SCRIPT, c, v, out], { encoding: "utf8" });
    return { status: r.status, stderr: r.stderr, out };
  }

  const read = (f) => JSON.parse(readFileSync(f, "utf8"));

  test("[M6] merge-traffic: first run writes both kinds with GitHub's 14-day totals and sorted days", (t) => {
    const dir = scratch(t);
    const r = run(dir, body("clones", days(1, 14).reverse(), 500, 50), body("views", days(1, 14, 3), 300, 30));
    assert.equal(r.status, 0, r.stderr);
    const f = read(r.out);
    assert.deepEqual(Object.keys(f), ["clones", "views"]);
    assert.equal(f.clones.count, 500);
    assert.equal(f.clones.uniques, 50);
    assert.equal(f.views.count, 300);
    assert.deepEqual(f.clones.days, days(1, 14));
    assert.deepEqual(f.views.days, days(1, 14, 3));
  });

  test("[M6] merge-traffic: a later run keeps older days and the newest body wins on the same timestamp", (t) => {
    const dir = scratch(t);
    assert.equal(run(dir, body("clones", days(1, 14)), body("views", days(1, 14))).status, 0);
    const newer = days(8, 21, 100); // overlaps 8..14 with new figures (day 14 was partial)
    const r = run(dir, body("clones", newer, 777, 77), body("views", newer, 666, 66));
    assert.equal(r.status, 0, r.stderr);
    const f = read(r.out);
    assert.deepEqual(f.clones.days, [...days(1, 7), ...newer]);
    assert.deepEqual(f.views.days, [...days(1, 7), ...newer]);
    assert.equal(f.clones.count, 777);
    assert.equal(f.views.uniques, 66);
  });

  test("[M6] merge-traffic: one missed weekly run loses no day (ADR-0011: the 14-day window spans two runs)", (t) => {
    const dir = scratch(t);
    assert.equal(run(dir, body("clones", days(1, 14)), body("views", days(1, 14))).status, 0);
    // the run for days 8..21 failed; the next run sees 15..28
    assert.equal(run(dir, body("clones", days(15, 28)), body("views", days(15, 28))).status, 0);
    const f = read(path.join(dir, "metrics", "traffic.json"));
    assert.deepEqual(f.clones.days.map((d) => d.timestamp), days(1, 28).map((d) => d.timestamp));
  });

  test("[M6] merge-traffic: same input twice gives a byte-identical file (commit only when changed)", (t) => {
    const dir = scratch(t);
    const c = body("clones", days(3, 16));
    const v = body("views", days(3, 16));
    assert.equal(run(dir, c, v).status, 0);
    const first = readFileSync(path.join(dir, "metrics", "traffic.json"));
    assert.equal(run(dir, c, v).status, 0);
    assert.deepEqual(readFileSync(path.join(dir, "metrics", "traffic.json")), first);
  });

  test("[M6] merge-traffic: extra fields from GitHub are not stored", (t) => {
    const dir = scratch(t);
    const c = { ...body("clones", [{ ...days(1, 1)[0], extra: 1 }]), extra: true };
    const r = run(dir, c, body("views", []));
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(read(r.out).clones, { count: 999, uniques: 99, days: days(1, 1) });
  });

  test("[M6] merge-traffic: bad input exits 1 with one stderr line and leaves the file untouched", (t) => {
    const dir = scratch(t);
    assert.equal(run(dir, body("clones", days(1, 2)), body("views", days(1, 2))).status, 0);
    const out = path.join(dir, "metrics", "traffic.json");
    const before = readFileSync(out);
    const bad = [
      ["not JSON", "{", body("views", [])],
      ["error body", { message: "Must have push access to repository" }, body("views", [])],
      ["wrong kind array", body("views", days(1, 2)), body("views", [])],
      ["bad timestamp", body("clones", [{ timestamp: "2026-10-01", count: 1, uniques: 1 }]), body("views", [])],
      ["negative count", body("clones", [{ timestamp: ts(1), count: -1, uniques: 1 }]), body("views", [])],
      ["views missing", body("clones", []), body("clones", [])],
    ];
    for (const [label, c, v] of bad) {
      const r = run(dir, c, v);
      assert.equal(r.status, 1, label);
      assert.equal(r.stderr.trim().split("\n").length, 1, `${label}: ${r.stderr}`);
      assert.deepEqual(readFileSync(out), before, label);
    }
  });

  test("[M6] merge-traffic: a corrupt stored file is an error, not a reset", (t) => {
    const dir = scratch(t);
    const out = path.join(dir, "traffic.json");
    writeFileSync(out, JSON.stringify({ clones: { days: "x" } }));
    const r = run(dir, body("clones", []), body("views", []), out);
    assert.equal(r.status, 1);
    assert.equal(readFileSync(out, "utf8"), JSON.stringify({ clones: { days: "x" } }));
  });

  test("[M6] merge-traffic: wrong argument count exits 1 and writes nothing", (t) => {
    const dir = scratch(t);
    const r = spawnSync(process.execPath, [SCRIPT, path.join(dir, "a.json")], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /usage/);
    assert.equal(existsSync(path.join(dir, "a.json")), false);
  });
});
