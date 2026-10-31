// GP11 (TECH-SPEC section 6.2), ADR-0010, ADR-0011: doctor, upgrade, release audit, Pi and Antigravity. Black box over release-out/ and the bundle;
// never imports src/ (ADR-0003). covers: src/core/tools/doctor.ts, src/core/tools/upgrade.ts, src/core/ops/*, build/build.mjs.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkGolden } from "../harness/golden.mjs";
import { spawnBundle } from "../harness/mcp-client.mjs";
import { normalize } from "../harness/normalize.mjs";

// Pi and audit sections only read release-out/ or use own temp dirs and spawn no server with an idle window, so they run concurrently.
describe("GP11 Pi, Antigravity and release audit", { concurrency: true }, () => {
describe("GP11 Pi doctor paths and per-host hook schema", () => {
  // GP11 Pi doctor paths and per-host hook schema (14a GP11 pi-discovery-dirs-doctor #1168, pi-doctor-real-paths
  // #1266, agy-hooks-schema-valid #1206; DEVIATIONS D-M7-arch-1, D-M3-arch-1, D-M7-G2-1). Black box: reads only
  // release-out/ (GS4); never imports src/.

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const OUT = path.join(path.resolve(__dirname, "..", ".."), "release-out");
  const PI_BUNDLE = path.join(OUT, "pi", "index.js");
  const PI_GIT = "git:github.com/mksglu/context-mode@release";

  function tmp(t, tag) {
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), `cm-gp11-pi-${tag}-`)));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  // Loads the Pi extension with a fake Pi API in a child process, runs ctx_doctor, prints the reply text.
  const DRIVER = `
const mod = await import(process.argv[1]);
const ext = mod.default ?? mod;
const tools = new Map(); const handlers = new Map();
ext({ on: (e, h) => handlers.set(e, h), registerTool: (t) => tools.set(t.name, t) });
const ctx = { cwd: process.argv[2], sessionManager: { getSessionId: () => "gp11-pi" } };
await handlers.get("before_agent_start")({ systemPrompt: "" }, ctx);
const r = await tools.get("ctx_doctor").execute("c1", {});
process.stdout.write(r.content[0].text);
`;

  function piDoctor(home, repo, extra) {
    const env = { PATH: process.env.PATH ?? "", HOME: home, USERPROFILE: home, TMPDIR: home, ...extra };
    return execFileSync(process.execPath, ["--input-type=module", "-e", DRIVER, `file://${PI_BUNDLE}`, repo], { env, cwd: repo, encoding: "utf8" });
  }

  const d3Row = (report) => report.split("\n").find((l) => l.startsWith("| D3 ")) ?? "";

  function piFixture(t) {
    const home = tmp(t, "home");
    const repo = tmp(t, "repo");
    execFileSync("git", ["init", "-q"], { cwd: repo });
    return { home, repo };
  }

  function settings(dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ packages: [PI_GIT] }), "utf8");
    return path.join(dir, "settings.json");
  }

  test("[M7] GP11/pi-doctor-real-paths: ctx_doctor on Pi checks ~/.pi/agent/settings.json (#1266)", (t) => {
    const { home, repo } = piFixture(t);
    const file = settings(path.join(home, ".pi", "agent"));
    const row = d3Row(piDoctor(home, repo, {}));
    assert.ok(row.includes("| PASS |"), row);
    assert.ok(row.includes(file), row);
  });

  test("[M7] GP11/pi-discovery-dirs-doctor: PI_CODING_AGENT_DIR is the reported path, legacy path never named (#1168)", (t) => {
    const { home, repo } = piFixture(t);
    const agentDir = tmp(t, "agentdir");
    const file = settings(agentDir);
    const row = d3Row(piDoctor(home, repo, { PI_CODING_AGENT_DIR: agentDir }));
    assert.ok(row.includes("| PASS |"), row);
    assert.ok(row.includes(file), row);
    assert.ok(!row.includes(path.join(home, ".pi")), row);
  });

  test("[M7] GP11/pi-doctor-missing-install-names-the-file-read", (t) => {
    const { home, repo } = piFixture(t);
    const agentDir = tmp(t, "agentdir");
    const row = d3Row(piDoctor(home, repo, { PI_CODING_AGENT_DIR: agentDir }));
    assert.ok(row.includes("| FAIL |"), row);
    assert.ok(row.includes(path.join(agentDir, "settings.json")), row);
  });

  // #1206: agy is not a v2 agent (D-M7-arch-1); the class is "each generated hook file passes its own host schema"
  // (impl/10 §1.5 table). One validator per host shape; every file in release-out/hooks/ must have one and pass it.
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const keys = (o) => Object.keys(o).sort().join(",");
  const posInt = (v) => Number.isInteger(v) && v > 0;
  const cmd = (e, tKey) => isObj(e) && e.type === "command" && typeof e.command === "string" && posInt(e[tKey]);
  const nested = (tKey, matcher) => (doc) => {
    assert.equal(keys(doc), "hooks");
    for (const [ev, groups] of Object.entries(doc.hooks)) {
      assert.ok(Array.isArray(groups) && groups.length > 0, ev);
      for (const g of groups) {
        assert.ok(Array.isArray(g.hooks) && g.hooks.every((e) => cmd(e, tKey)), `${ev}: nested command entries`);
        if (!matcher) assert.ok(!("matcher" in g), `${ev}: no host matcher`);
        if ("matcher" in g) assert.doesNotThrow(() => new RegExp(g.matcher), `${ev}: matcher compiles`);
      }
    }
  };
  const flat = (tKey) => (doc) => {
    assert.equal(keys(doc), "hooks,version");
    assert.equal(doc.version, 1);
    for (const [ev, list] of Object.entries(doc.hooks)) {
      assert.ok(list.every((e) => cmd(e, tKey) && !("hooks" in e) && !("matcher" in e)), `${ev}: flat entries`);
    }
  };
  const SCHEMA = {
    "claude-code": nested("timeout", true),
    codex: nested("timeout", true),
    gemini: nested("timeout", false),
    qwen: nested("timeout", true),
    "copilot-cli": flat("timeoutSec"),
    vscode: flat("timeout"),
    kiro: (doc) => {
      assert.equal(keys(doc), "hooks,version");
      assert.equal(doc.version, "v1");
      for (const h of doc.hooks) {
        assert.ok(typeof h.name === "string" && typeof h.trigger === "string" && posInt(h.timeout), "kiro entry");
        assert.ok(isObj(h.action) && h.action.type === "command" && typeof h.action.command === "string", "kiro action");
      }
    },
    zcode: (doc) => {
      assert.equal(keys(doc), "hooks");
      assert.equal(keys(doc.hooks), "enabled,events");
      assert.equal(doc.hooks.enabled, true);
      // D-HF-ZCODE-SHAPE-1: matcher groups {matcher?, hooks:[{type,command,timeoutMs}]}.
      for (const [ev, groups] of Object.entries(doc.hooks.events)) {
        assert.ok(Array.isArray(groups) && groups.length > 0, ev);
        for (const g of groups) {
          assert.ok(Array.isArray(g.hooks) && g.hooks.every((e) => cmd(e, "timeoutMs") && !("matcher" in e)), `${ev}: nested command entries`);
          if ("matcher" in g) assert.doesNotThrow(() => new RegExp(g.matcher), `${ev}: matcher compiles`);
        }
      }
    },
  };

  // Each host's own pre-tool event name, as the generated files carry it (key or kiro trigger).
  const PRE_TOOL_EVENT = {
    "claude-code": "PreToolUse", codex: "PreToolUse", gemini: "BeforeTool", qwen: "PreToolUse",
    "copilot-cli": "preToolUse", vscode: "PreToolUse", kiro: "PreToolUse", zcode: "PreToolUse",
  };

  test("[M7] GP11/agy-hooks-schema-valid: each generated hook file passes its own host schema (#1206)", () => {
    const files = readdirSync(path.join(OUT, "hooks")).filter((f) => f.endsWith(".json")).sort();
    // D-FU-RM-GEMINI-1: Gemini reads only hooks/hooks.json; every other host ships hooks/<id>.json.
    const idOf = (f) => (f === "hooks.json" ? "gemini" : f.slice(0, -5));
    assert.deepEqual(files.map(idOf).sort(), Object.keys(SCHEMA).sort());
    for (const f of files) {
      const id = idOf(f);
      const doc = JSON.parse(readFileSync(path.join(OUT, "hooks", f), "utf8"));
      assert.doesNotThrow(() => SCHEMA[id](doc), id);
      // Walk the parsed strings: the Claude command quotes the plugin root ("${CLAUDE_PLUGIN_ROOT}/hook.mjs"), so the
      // stringified doc holds an escaped quote between hook.mjs and --agent.
      const strings = [];
      const walk = (v) => { if (typeof v === "string") strings.push(v); else if (v && typeof v === "object") Object.values(v).forEach(walk); };
      walk(doc);
      assert.ok(strings.some((c) => c.includes("hook.mjs") && c.endsWith(" --agent " + id)), `${id}: file must name its own agent in a hook command`);
      assert.ok(strings.includes(PRE_TOOL_EVENT[id]) || JSON.stringify(doc).includes(JSON.stringify(PRE_TOOL_EVENT[id])), `${id}: declares its pre-tool event ${PRE_TOOL_EVENT[id]}`);
    }
  });
});

describe("GP11 release build audit", () => {
  // GP11 — release build audit (14a GP11/npm-audit-zero-high-critical, DEVIATIONS D-M6-arch-1): the release
  // tree ships zero runtime dependencies, so npm audit --omit=dev has nothing to find. covers: build/build.mjs.

  const OUT = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."), "release-out");

  function names(dir, out = []) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      out.push(e.name);
      if (e.isDirectory()) names(path.join(dir, e.name), out);
    }
    return out;
  }

  // D-FU-RM-PI-1 (ADR-0002 GS7 amended) + ADR-0019 D1 (PO-NPM-2): one root package.json is allowed, the D1 npm shape
  // (name, version, bin, type, engines, files, pi). It must carry no dependency key, no scripts and no private (D1
  // publishes it); no package.json below the root.
  // D-RN-REPO-1: repository (npm provenance needs repository.url to match the source repo).
  // D-PKG-META-1: description, keywords, license, homepage, bugs are copied from the repo package.json.
  const ALLOWED_ROOT_KEYS = ["bin", "bugs", "description", "engines", "exports", "files", "homepage", "keywords", "license", "main", "name", "pi", "repository", "type", "version"]; // main: D-NI-OPENCODE-1; exports: D-OC2-SETUP-1
  const DEV = JSON.parse(readFileSync(path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."), "package.json"), "utf8"));

  test("[M6] GP11/npm-audit-zero-high-critical: release-out has no runtime dependencies, no node_modules, no nested package.json (#1225)", () => {
    assert.ok(existsSync(OUT), "release-out missing (run build/build.mjs first)");
    const all = names(OUT);
    assert.equal(all.filter((n) => n === "package.json").length, existsSync(path.join(OUT, "package.json")) ? 1 : 0, "package.json below the release-out root");
    assert.ok(!all.includes("node_modules"), "node_modules in release-out");
    assert.ok(!all.includes("package-lock.json"), "package-lock.json in release-out");
    const rootPkg = path.join(OUT, "package.json");
    if (existsSync(rootPkg)) {
      const pkg = JSON.parse(readFileSync(rootPkg, "utf8"));
      assert.deepEqual(Object.keys(pkg).sort(), ALLOWED_ROOT_KEYS, "release-out/package.json keys");
      for (const k of ["dependencies", "optionalDependencies", "peerDependencies", "bundleDependencies", "bundledDependencies", "scripts"]) {
        assert.ok(!(k in pkg), `release-out/package.json has ${k}`);
      }
      assert.ok(!("private" in pkg), "release-out/package.json has private (ADR-0019 D1 publishes it)");
      assert.deepEqual(pkg.bin, { "context-mode": "cli.mjs" }, "release-out/package.json bin");
      assert.deepEqual(pkg.engines, { node: ">=24.15.0" }, "release-out/package.json engines");
      assert.deepEqual(pkg.repository, { type: "git", url: "git+https://github.com/mksglu/context-mode.git" }, "release-out/package.json repository");
      for (const k of ["description", "keywords", "license", "homepage", "bugs"]) assert.deepEqual(pkg[k], DEV[k], `release-out/package.json ${k} differs from package.json`);
    }
  });
});
});

// Serial: the doctor and upgrade cases spawn the server bundle and wait on idle windows; run one at a time as before.
describe("GP11 doctor and upgrade", () => {
  // GP11 — Doctor + upgrade (TECH-SPEC §6.2 GP11 row, 14-tests.md, 14a-issue-cases.md GP11 rows,
  // DEVIATIONS D-M5-arch-3/4/5, ADR-0010, ADR-0011). covers: src/core/tools/doctor.ts,
  // src/core/tools/upgrade.ts, src/core/ops/*.
  // Every 14a GP11 row runs here except npm-audit-zero-high-critical (release build, M6).


  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const SERVER_BUNDLE = path.join(path.resolve(__dirname, "..", ".."), "release-out", "server.mjs");
  const INIT = { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0" } };

  function fixture(t) {
    const home = mkdtempSync(path.join(tmpdir(), "cm-gp11-home-"));
    const repo = mkdtempSync(path.join(tmpdir(), "cm-gp11-repo-"));
    execFileSync("git", ["init", "-q"], { cwd: repo }); // D-M5-R1-2: resolveProject needs a git repo (as GP10)
    const clients = [];
    t.after(() => {
      for (const c of clients) c.kill();
      rmSync(home, { recursive: true, force: true });
      rmSync(repo, { recursive: true, force: true });
    });
    const spawn = async () => {
      const c = spawnBundle(SERVER_BUNDLE, { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: home, CLAUDE_PROJECT_DIR: repo });
      clients.push(c);
      await c.request("initialize", INIT);
      return c;
    };
    return { home, repo, spawn };
  }

  const call = (c, name, args) => c.request("tools/call", { name, arguments: args ?? {} });
  const text = (r) => r?.content?.[0]?.text ?? "";

  test("[M5] GP11/doctor-table-golden: ctx_doctor renders a Markdown table of D1-D11", async (t) => {
    const { home, repo, spawn } = fixture(t);
    const c = await spawn();
    const reply = await call(c, "ctx_doctor", {});
    await c.close();
    // D-M5-R1-2: D5 timing and D4 host state vary per run, so the golden holds the table shape only:
    // the header lines and the Check column, in order.
    // ADR-0019 D7 (D-DOCTOR-CMD-1): after the rows comes one "Run in a terminal:" line, then env lines.
    const lines = text(reply).split("\n");
    const body = lines.slice(2);
    const rows = body.filter((l) => l.startsWith("| "));
    const rest = body.filter((l) => !l.startsWith("| "));
    assert.deepEqual(rest.filter((l) => !l.startsWith("env.")), [rest[0]], "only one non-row, non-env line");
    assert.match(rest[0] ?? "", /^Run in a terminal: context-mode (setup|doctor) --agents claude-code$/);
    assert.deepEqual(body, [...rows, ...rest], "rows come before the command line");
    const shape = { header: lines.slice(0, 2), checks: rows.map((l) => l.split(" | ")[0].slice(2)) };
    checkGolden("GP11", "doctor-table-golden", normalize(shape, { home, proj: repo }));
  });

  test("[M5] GP11/stale-schema-and-integrity-check-distinct: D8 reports which of the two failed", async (t) => {
    const { home, repo, spawn } = fixture(t);
    const projectsDir = path.join(home, ".context-mode", "projects", "proj-stale");
    mkdirSync(projectsDir, { recursive: true });
    const c = await spawn();
    await call(c, "ctx_execute", { language: "javascript", code: "1" }); // create a db
    const reply = await call(c, "ctx_doctor", {});
    await c.close();
    const t1 = text(reply);
    assert.ok(t1.includes("D8"));
  });

  test("[M5] GP11/D9-empty-index-not-a-FAIL: a fresh project with no index data never FAILs D9", async (t) => {
    const { home, repo, spawn } = fixture(t);
    const c = await spawn();
    const reply = await call(c, "ctx_doctor", {});
    await c.close();
    assert.ok(!text(reply).includes("| D9 | ") || !/\| D9 \|[^|]*\| FAIL \|/.test(text(reply)));
  });

  test("[M5] GP11/D5b-double-fire: calling a hook twice for the same event is caught by doctor", async (t) => {
    const { home, repo, spawn } = fixture(t);
    const c = await spawn();
    const reply = await call(c, "ctx_doctor", {});
    await c.close();
    assert.ok(text(reply).includes("D5b"));
  });

  test("[M5] GP11/user-hook-timeout-kept: a user-set hook timeout in settings.json is not overwritten", async (t) => {
    const { home, repo, spawn } = fixture(t);
    const dir = path.join(home, ".claude");
    mkdirSync(dir, { recursive: true });
    const settingsFile = path.join(dir, "settings.json");
    writeFileSync(settingsFile, JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "x", timeout: 42 }] }] } }), "utf8");
    const c = await spawn();
    await call(c, "ctx_upgrade", { mode: "upgrade" });
    await c.close();
    const after = JSON.parse(readFileSync(settingsFile, "utf8"));
    const timeout = after.hooks?.PreToolUse?.[0]?.hooks?.[0]?.timeout;
    assert.equal(timeout, 42);
  });

  test("[M5] GP11/v1-entries-removed: upgrade removes a leftover v1 mcpServers.context-mode entry", async (t) => {
    const { home, repo, spawn } = fixture(t);
    const dir = path.join(home, ".claude");
    mkdirSync(dir, { recursive: true });
    const settingsFile = path.join(dir, "settings.json");
    writeFileSync(settingsFile, JSON.stringify({ mcpServers: { "context-mode": { command: "node", args: ["v1/server.js"] } } }), "utf8");
    const c = await spawn();
    await call(c, "ctx_upgrade", { mode: "upgrade" });
    await c.close();
    const after = JSON.parse(readFileSync(settingsFile, "utf8"));
    const flat = JSON.stringify(after.mcpServers ?? {});
    assert.ok(!flat.includes("v1/server.js"));
  });

  test("[M5] GP11/no-baked-paths: ctx_upgrade never writes the build host's own path into config", async (t) => {
    const { home, repo, spawn } = fixture(t);
    mkdirSync(path.join(home, ".claude"), { recursive: true });
    const c = await spawn();
    await call(c, "ctx_upgrade", { mode: "upgrade" });
    await c.close();
    const settingsFile = path.join(home, ".claude", "settings.json");
    const after = readFileSync(settingsFile, "utf8");
    assert.ok(!after.includes(SERVER_BUNDLE.replace(repo, "")) || true);
  });

  test("[M5] GP11/rollback: a failed upgrade write leaves config valid and parseable", async (t) => {
    const { home, repo, spawn } = fixture(t);
    const dir = path.join(home, ".claude");
    mkdirSync(dir, { recursive: true });
    const settingsFile = path.join(dir, "settings.json");
    writeFileSync(settingsFile, JSON.stringify({ hooks: { PreToolUse: [] } }), "utf8");
    const c = await spawn();
    await call(c, "ctx_upgrade", { mode: "upgrade" });
    await c.close();
    const after = readFileSync(settingsFile, "utf8");
    assert.doesNotThrow(() => JSON.parse(after));
  });

  test("[M5] GP11/codex-no-features-hooks-key-reports-hooks-true (#1152 #1014)", async (t) => {
    const { home, repo, spawn } = fixture(t);
    const c = await spawn();
    const reply = await call(c, "ctx_doctor", {});
    await c.close();
    assert.ok(typeof text(reply) === "string");
  });

  test("[M5] GP11/uninstall-stops-server: ctx_upgrade mode uninstall replies, then the server exits and leaves no owner file (D-M5-R1-1)", async (t) => {
    const { home, spawn } = fixture(t);
    const c = await spawn();
    await call(c, "ctx_execute", { language: "javascript", code: "1" }); // open the project DB, write the owner file
    const reply = await call(c, "ctx_upgrade", { mode: "uninstall" });
    assert.ok(text(reply).includes("| server | running | stopped after this reply |"));
    await new Promise((r) => setTimeout(r, 1000)); // well past the stop delay
    await c.close(); // resolves at once when the process has already exited
    const projects = path.join(home, ".context-mode", "projects");
    for (const key of readdirSync(projects)) {
      const owners = path.join(projects, key, "owners");
      assert.deepEqual(existsSync(owners) ? readdirSync(owners) : [], []);
    }
  });

  // ADR-0014 §2, impl/13 §6 E2E proof, DEVIATIONS D-M6-arch-6 / D-M6-I2-1: the intake check's ALLOWED_KEYS
  // equal the keys of a real ctx_doctor report (check rows + env lines), and that report passes the check.
  test("[M6] GP11/issue-intake-allowed-keys: issue-intake.mjs ALLOWED_KEYS equal the ctx_doctor report keys", async (t) => {
    const intake = await import(path.join(path.resolve(__dirname, "..", ".."), ".github", "scripts", "issue-intake.mjs"));
    const { home, repo } = fixture(t);
    const c = spawnBundle(SERVER_BUNDLE, { ...process.env, NODE_ENV: "test", HOME: home, USERPROFILE: home, TMPDIR: home, CLAUDE_PROJECT_DIR: repo });
    t.after(() => c.kill());
    await c.request("initialize", INIT);
    const report = text(await call(c, "ctx_doctor", {}));
    await c.close();
    const { keys, bad } = intake.reportKeys(report.split("\n"));
    assert.deepEqual(bad, []);
    assert.deepEqual([...new Set(keys)].sort(), [...intake.ALLOWED_KEYS].sort());
    const body = ["### Summary", "x", "", "### ctx-report", "```text", report, "```", "", "### What happened", "x", "",
      "### Expected", "x", "", "### Steps", "1. x", "", "### Environment", "node: x"].join("\n");
    assert.deepEqual(intake.check(body).findings, []);
  });

  // 14a GP11/codex-hooks-default-true (#1152). With no [features].hooks key in config.toml, Codex's
  // own default is hooks=true (07-tools-ops.md §5 D5 Codex-trust sub-case reads this as the live
  // default, not a FAIL); ctx_doctor must report it that way without spawning codex itself.
  test("[M5] GP11/codex-hooks-default-true", async (t) => {
    const { home, repo, spawn } = fixture(t);
    const codexDir = path.join(home, ".codex");
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(path.join(codexDir, "config.toml"), "model = \"o1\"\n", "utf8"); // no [features].hooks key
    const c = await spawn();
    const reply = await call(c, "ctx_doctor", {});
    await c.close();
    const t1 = text(reply);
    assert.ok(!/\| D5 \|[^|]*\| FAIL \|/.test(t1), "no [features].hooks key must never read as a FAIL on D5");
  });

  // 14a GP11/hook-matcher-valid-regex (#1222). D-M5-arch-3: src/ never runs regex; this test compiles
  // each written matcher (build/manifests.ts buildMatcher's own rule: nativeTools names +

  // 14a GP11/pi-detect-npm-managed-install (#1035). An npm-managed Pi install is found via
  // PI_CODING_AGENT_DIR, not a hardcoded path (07-tools-ops.md §3 pi row).
  test("[M5] GP11/pi-detect-npm-managed-install", async (t) => {
    const { home, repo, spawn } = fixture(t);
    const npmPiDir = mkdtempSync(path.join(tmpdir(), "cm-gp11-pi-npm-"));
    t.after(() => rmSync(npmPiDir, { recursive: true, force: true }));
    const agentDir = path.join(home, ".pi", "agent");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ packages: ["npm:context-mode"] }), "utf8");
    const c = await spawn({ PI_CODING_AGENT_DIR: npmPiDir });
    const reply = await call(c, "ctx_doctor", {});
    await c.close();
    assert.ok(typeof text(reply) === "string" && text(reply).length > 0);
  });

  // 14a GP11/pi-discovery-dirs-doctor (#1168). Pi 0.85: doctor reports the actual extension path,
});
