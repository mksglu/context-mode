// ADR-0018 (module map and build), ADR-0019 (npm channel), ADR-0023 (native install): build output, generated files, host manifests,
// hook shells and the npm package. One file per ADR area (docs/v2/TEST-LAYOUT.md, ADR-0024); a fix adds its red test here.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertOutPackageJson, buildMatcher, generateManifests } from "../../build/manifests.ts";
import { FATAL_VALUE, PROMPT, childEnv, fatalLog, scoreArm } from "../../e2e/live/npm-package/claude-code.mjs";
import { isReleaseVersion } from "../../scripts/release/release-tags.mjs";
import { ADAPTERS, getAdapter } from "../../src/adapters/table.ts";
import { COMPACT_POINTER_LINE, NODE_MIN, SERVER_KEY, TOOL_ORDER, prefixToolNames } from "../../src/core/contracts/constants.ts";
import { composeMatcher } from "../../src/core/ops/doctor-config.ts";
import { denyMessage } from "../../src/core/policy/decide.ts";
import { buildRegistry, renderSkill } from "../../src/setup/registry.ts";

// Sections are independent: each builds into its own temp dir and none changes process.env or the cwd, so they run concurrently.
describe("ADR-0018 / ADR-0019 / ADR-0023 build, generated files, host manifests, npm package", { concurrency: true }, () => {
describe("ADR-0018 build: release-out tree", () => {
  // Unit tests for build/build.mjs §2.2 step 5 (fixture copy, DEVIATIONS D-M5-arch-4) and the
  // BUNDLE_SHA esbuild define (D-M5-arch-5, D-M5-B1-1). Runs the real script into a scratch dir.

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const FIXTURE = path.join(REPO, "e2e", "fixtures", "hook-roundtrip.json");
  const SHA = "0123456789abcdef0123456789abcdef01234567";

  function build(t, extra = []) {
    const out = mkdtempSync(path.join(tmpdir(), "cm-v2-build-"));
    t.after(() => rmSync(out, { recursive: true, force: true }));
    const r = spawnSync(process.execPath, [path.join(REPO, "build", "build.mjs"), "--out", out, ...extra], { encoding: "utf8" });
    return { out, status: r.status, stderr: r.stderr };
  }

  test("[M5] build/fixture-copy: <out>/fixtures/hook-roundtrip.json equals e2e/fixtures/hook-roundtrip.json byte for byte", (t) => {
    const { out, status, stderr } = build(t);
    assert.equal(status, 0, stderr);
    assert.deepEqual(readFileSync(path.join(out, "fixtures", "hook-roundtrip.json")), readFileSync(FIXTURE));
  });

  // No entry may read BUNDLE_SHA yet (tree-shaken away), so the proof compares a dev and a --sha
  // build: the sha lands exactly where the dev build kept the define key, and nowhere else.
  const BUNDLE_FILES = ["server.mjs", "hook.mjs", "run.mjs", "search.mjs"];

  test("[M5] build/bundle-sha-define: --sha sets BUNDLE_SHA through the one define; without it nothing is set", (t) => {
    const dev = build(t);
    const rel = build(t, ["--sha", SHA]);
    assert.equal(dev.status, 0, dev.stderr);
    assert.equal(rel.status, 0, rel.stderr);
    for (const f of BUNDLE_FILES) {
      const d = readFileSync(path.join(dev.out, f), "utf8");
      const r = readFileSync(path.join(rel.out, f), "utf8");
      assert.ok(!d.includes(SHA), `${f}: dev build carries no sha`);
      assert.ok(!r.includes("__CTX_BUNDLE_SHA__"), `${f}: define replaced every use`);
      assert.equal(r.includes(JSON.stringify(SHA)), d.includes("__CTX_BUNDLE_SHA__"), `${f}: sha where the key was`);
    }
  });

  test("[M5] build/bundle-sha-invalid: --sha that is not 40 lowercase hex chars fails with one build failed line", (t) => {
    for (const bad of ["abc", SHA.toUpperCase(), SHA.slice(0, 39) + "g"]) {
      const { status, stderr } = build(t, ["--sha", bad]);
      assert.equal(status, 1, bad);
      assert.equal(stderr, `build failed: --sha ${bad} is not a 40-char lowercase hex commit sha\n`);
    }
  });

  // impl/13 §2.2 steps 4, 6, 8 (DEVIATIONS D-M6-arch-3, D-M6-B2-1).
  const MANIFESTS = [".claude-plugin/plugin.json", "gemini-extension.json", "qwen-extension.json", "copilot/plugin.json"];
  const SKILLS = ["ctx-stats", "ctx-doctor", "ctx-upgrade"];

  test("[M6] build/version-flag: --version lands in every manifest; no flag keeps 0.0.0-dev", (t) => {
    const dev = build(t);
    const rel = build(t, ["--version", "2.0.0"]);
    assert.equal(dev.status, 0, dev.stderr);
    assert.equal(rel.status, 0, rel.stderr);
    for (const m of MANIFESTS) {
      assert.equal(JSON.parse(readFileSync(path.join(dev.out, m), "utf8")).version, "0.0.0-dev", m);
      assert.equal(JSON.parse(readFileSync(path.join(rel.out, m), "utf8")).version, "2.0.0", m);
    }
  });

  // D-RN-TAG-1: x.y.z-<prerelease> is now a release version (2.0.0-rc.1 builds, see [RN] build/version-prerelease);
  // a malformed prerelease (2.0.0-rc..1) takes its place here.
  test("[M6] build/version-invalid: --version that is not x.y.z[-pre] fails with one build failed line", (t) => {
    for (const bad of ["2.0", "v2.0.0", "2.0.0-rc..1", "2..0", "2.0.x"]) {
      const { status, stderr } = build(t, ["--version", bad]);
      assert.equal(status, 1, bad);
      assert.equal(stderr, `build failed: --version ${bad} is not an x.y.z release version\n`);
    }
  });

  // Skills fix: gemini loads <extension>/skills and pi loads package.json pi.skills unrendered, so the build writes
  // each host's copy from the one skills/ source with that host's real tool names (split/join, D-HQ-SKILLS-1).
  test("[M6] build/command-skills: gemini skills/ and pi pi/skills are the 3 skills rendered with the host tool names", async (t) => {
    const { renderSkill } = await import("../../src/setup/registry.ts");
    const { getAdapter } = await import("../../src/adapters/table.ts");
    const { out, status, stderr } = build(t);
    assert.equal(status, 0, stderr);
    // D-HQ-SKILLS-3: qwen reads the same <extension>/skills dir as gemini, so that dir names both tools.
    for (const [id, dir, stats, prefixes] of [["gemini", "skills", "mcp_context-mode_ctx_stats or mcp__context-mode__ctx_stats", ["mcp_context-mode_", "mcp__context-mode__"]], ["pi", "pi/skills", "ctx_stats", [""]]]) {
      assert.equal(getAdapter(id).skillChannel.path, dir, id + " skill channel is the build dir");
      assert.deepEqual(readdirSync(path.join(out, dir)).sort(), [...SKILLS].sort(), dir);
      for (const s of SKILLS) {
        const src = readFileSync(path.join(REPO, "skills", s, "SKILL.md"), "utf8");
        assert.equal(readFileSync(path.join(out, dir, s, "SKILL.md"), "utf8"), renderSkill(src, prefixes), dir + " " + s);
      }
      assert.ok(readFileSync(path.join(out, dir, "ctx-stats", "SKILL.md"), "utf8").includes("Call the " + stats + " tool"), id + " names " + stats);
    }
  });

  test("[M6] build/hashes-last: SHA256SUMS lists every other file in the tree with its sha256", (t) => {
    const { out, status, stderr } = build(t);
    assert.equal(status, 0, stderr);
    const walk = (dir, pre) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const rel = pre ? pre + "/" + e.name : e.name;
      return e.isDirectory() ? walk(path.join(dir, e.name), rel) : [rel];
    });
    const files = walk(out, "").filter((f) => f !== "SHA256SUMS").sort();
    const lines = readFileSync(path.join(out, "SHA256SUMS"), "utf8").split("\n").filter((l) => l !== "");
    assert.deepEqual(lines.map((l) => l.slice(66)), files);
    for (const l of lines) {
      const hex = createHash("sha256").update(readFileSync(path.join(out, l.slice(66)))).digest("hex");
      assert.equal(l.slice(0, 66), hex + "  ", l);
    }
  });

  // Release-next (D-RN-TAG-1): a pushed tag v2.0.0-next.1 builds version 2.0.0-next.1; bad prerelease parts fail.
  test("[RN] build/version-prerelease: --version x.y.z-next.N lands in every manifest and package.json", (t) => {
    assert.equal(build(t, ["--version", "2.0.0-rc.1"]).status, 0, "2.0.0-rc.1 is a prerelease version now");
    const rel = build(t, ["--version", "2.0.0-next.1"]);
    assert.equal(rel.status, 0, rel.stderr);
    for (const m of [...MANIFESTS, "package.json"]) {
      assert.equal(JSON.parse(readFileSync(path.join(rel.out, m), "utf8")).version, "2.0.0-next.1", m);
    }
    for (const bad of ["2.0.0-", "2.0.0-next..1", "2.0.0-next.01", "2.0.0+b"]) {
      const r = build(t, ["--version", bad]);
      assert.notEqual(r.status, 0, bad);
      assert.ok(r.stderr.includes(`--version ${bad} is not an x.y.z release version`), r.stderr);
    }
  });
});

describe("ADR-0018 build: generated prompt file stays stable", () => {
  // build/build.mjs --generated-only must not rewrite an up-to-date src/prompt/_generated.ts (DEVIATIONS D-RN-GEN-1).
  // release.yml run 40487200279: parallel test files run build.mjs while server children import the file;
  // writeFileSync truncates first, so a child read an empty file ("does not provide an export named
  // 'TOOL_DESCRIPTIONS'"). Same bytes: no write at all (same inode, same mtime).

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const GENERATED = path.join(REPO, "src", "prompt", "_generated.ts");
  const gen = () => spawnSync(process.execPath, [path.join(REPO, "build", "build.mjs"), "--generated-only"], { encoding: "utf8" });

  test("[RN] build/generated-stable: --generated-only leaves an up-to-date _generated.ts untouched (same inode, mtime, bytes)", async () => {
    const first = gen();
    assert.equal(first.status, 0, first.stderr);
    const before = statSync(GENERATED, { bigint: true });
    const bytes = readFileSync(GENERATED);
    await new Promise((r) => setTimeout(r, 50)); // a rewrite now gets a later mtime
    const second = gen();
    assert.equal(second.status, 0, second.stderr);
    const after = statSync(GENERATED, { bigint: true });
    assert.deepEqual(readFileSync(GENERATED), bytes);
    assert.equal(after.ino, before.ino, "file was replaced");
    assert.equal(after.mtimeNs, before.mtimeNs, "file was rewritten");
  });
});

describe("ADR-0018 build: SHA256SUMS and hashes", () => {
  // Unit tests for build/hash.mjs (docs/v2/impl/13-build-release.md §4): SHA256SUMS over the
  // release tree — sorted relative POSIX paths, `<hex>  <path>\n` lines, no trailing blank line,
  // SHA256SUMS itself excluded. Covers the export writeHashes(outDir) and the CLI `--out <dir>`.

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const HASH = path.join(REPO, "build", "hash.mjs");
  const HASH_URL = pathToFileURL(HASH).href;

  const sha = (s) => createHash("sha256").update(s).digest("hex");

  function tree(t) {
    const out = mkdtempSync(path.join(tmpdir(), "cm-v2-hash-"));
    t.after(() => rmSync(out, { recursive: true, force: true }));
    mkdirSync(path.join(out, "b", "nested"), { recursive: true });
    mkdirSync(path.join(out, "a"), { recursive: true });
    writeFileSync(path.join(out, "z.txt"), "zed\n");
    writeFileSync(path.join(out, "a", "one.mjs"), "export {};\n");
    writeFileSync(path.join(out, "b", "nested", "deep.json"), "{}");
    writeFileSync(path.join(out, "B.md"), "upper");
    writeFileSync(path.join(out, "empty"), "");
    return out;
  }

  const EXPECTED = [
    ["B.md", "upper"],
    ["a/one.mjs", "export {};\n"],
    ["b/nested/deep.json", "{}"],
    ["empty", ""],
    ["z.txt", "zed\n"],
  ].map(([p, c]) => `${sha(c)}  ${p}\n`).join("");

  test("[M6] build/hash: writeHashes writes sorted POSIX `<hex>  <path>` lines, no trailing blank line", async (t) => {
    const { writeHashes } = await import(HASH_URL);
    const out = tree(t);
    assert.equal(writeHashes(out), undefined);
    const sums = readFileSync(path.join(out, "SHA256SUMS"), "utf8");
    assert.equal(sums, EXPECTED);
    assert.ok(sums.endsWith("\n") && !sums.endsWith("\n\n"));
  });

  test("[M6] build/hash: SHA256SUMS never lists itself; a rerun is byte-identical", async (t) => {
    const { writeHashes } = await import(HASH_URL);
    const out = tree(t);
    writeFileSync(path.join(out, "SHA256SUMS"), "stale\n");
    writeHashes(out);
    const first = readFileSync(path.join(out, "SHA256SUMS"));
    writeHashes(out);
    assert.deepEqual(readFileSync(path.join(out, "SHA256SUMS")), first);
    assert.equal(first.toString("utf8"), EXPECTED);
  });

  test("[M6] build/hash: CLI --out <dir> writes the same file and exits 0", (t) => {
    const out = tree(t);
    const r = spawnSync(process.execPath, [HASH, "--out", out], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(path.join(out, "SHA256SUMS"), "utf8"), EXPECTED);
  });

  test("[M6] build/hash: CLI without --out or with a missing dir fails with one `build failed:` line, exit 1", (t) => {
    const none = spawnSync(process.execPath, [HASH], { encoding: "utf8" });
    assert.equal(none.status, 1);
    assert.ok(none.stderr.startsWith("build failed: "), none.stderr);
    const gone = path.join(tmpdir(), `cm-v2-hash-missing-${process.pid}`);
    const r = spawnSync(process.execPath, [HASH, "--out", gone], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.ok(r.stderr.startsWith("build failed: "), r.stderr);
    assert.equal(r.stderr.trimEnd().split("\n").length, 1);
  });
});

describe("ADR-0018 build: manifests", () => {
  // Unit tests for build/manifests.ts (impl/13 §3; impl/10 §1.5; DECISIONS-r9 R1, R4; DEVIATIONS D-M3-arch-4,
  // D-M3-A7-1..4). Expected matchers are the impl/10 §1.5 literals; zcode uses the r9 R4 Claude names (D-M3-A7-1).


  // D-PKG-META-1: the shared release fields are read from the repo package.json, so the tests read them there too.
  const DEV = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"), "utf8"));
  const META = { description: DEV.description, keywords: DEV.keywords, license: DEV.license, homepage: DEV.homepage, bugs: DEV.bugs };

  const CLAUDE_MATCHER_NAMES = "Bash|Read|Grep|WebFetch|Write|Edit|NotebookEdit";
  const MATCHERS = {
    "claude-code": `^(${CLAUDE_MATCHER_NAMES}|mcp__plugin_context-mode_context-mode__ctx_.*)$`,
    codex: "^(Bash|apply_patch|mcp__context_mode__ctx_.*)$",
    qwen: "^(run_shell_command|Shell|read_file|grep_search|web_fetch|mcp__context-mode__ctx_.*)$",
    zcode: `^(${CLAUDE_MATCHER_NAMES}|mcp__context-mode__ctx_.*)$`,
  };

  const EXPECTED_FILES = [
    ".claude-plugin/marketplace.json",
    ".claude-plugin/plugin.json",
    ".codex-plugin/hooks.json", // ADR-0023 D-NI-CODEX-1
    ".codex-plugin/mcp.json",
    ".codex-plugin/plugin.json",
    "copilot/plugin.json",
    "gemini-extension.json",
    "hooks/claude-code.json",
    "hooks/codex.json",
    "hooks/copilot-cli.json",
    "hooks/hooks.json",
    "hooks/kiro.json",
    "hooks/qwen.json",
    "hooks/vscode.json",
    "hooks/zcode.json",
    "package.json",
    "qwen-extension.json",
  ];

  function scratch(t) {
    const dir = mkdtempSync(path.join(tmpdir(), "cm-v2-manifests-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  function listFiles(root, rel = "") {
    const out = [];
    for (const name of readdirSync(path.join(root, rel))) {
      const r = rel === "" ? name : rel + "/" + name;
      if (statSync(path.join(root, r)).isDirectory()) out.push(...listFiles(root, r));
      else out.push(r);
    }
    return out.sort();
  }

  const readJson = (dir, rel) => JSON.parse(readFileSync(path.join(dir, rel), "utf8"));

  test("buildMatcher gives the impl/10 §1.5 matcher for every host-matcher row", () => {
    for (const [id, expected] of Object.entries(MATCHERS)) assert.equal(buildMatcher(getAdapter(id)), expected, id);
  });

  test("D-M2-MCP-1: the claude-code PostToolUse matcher also names every MCP tool; PreToolUse does not", () => {
    const row = getAdapter("claude-code");
    assert.equal(buildMatcher(row, "PostToolUse"), `^(${CLAUDE_MATCHER_NAMES}|mcp__plugin_context-mode_context-mode__ctx_.*|mcp__.*)$`);
    assert.equal(buildMatcher(row, "PreToolUse"), MATCHERS["claude-code"]);
    const post = new RegExp(buildMatcher(row, "PostToolUse"));
    assert.ok(post.test("mcp__tix__list_tickets") && post.test("mcp__plugin_context-mode_context-mode__ctx_search") && !post.test("Glob"));
    for (const id of ["codex", "qwen", "zcode"]) assert.equal(buildMatcher(getAdapter(id), "PostToolUse"), MATCHERS[id], id);
  });

  test("buildMatcher escapes only the prefix; missing nativeTools slots add nothing", () => {
    const row = { ...getAdapter("kiro"), toolNamePrefix: "a.b(c)|", nativeTools: { shell: [], edit: ["x"] } };
    assert.equal(buildMatcher(row), "^(x|a\\.b\\(c\\)\\|ctx_.*)$");
    const own = new RegExp(buildMatcher(row));
    assert.ok(own.test("a.b(c)|ctx_execute"));
    assert.ok(!own.test("aXb(c)|ctx_execute"));
  });

  test("generateManifests writes exactly the manifest + hook files (impl/13 §3.1 step 2, D-M3-A7-2)", (t) => {
    const dir = scratch(t);
    generateManifests(dir);
    assert.deepEqual(listFiles(dir), EXPECTED_FILES);
  });

  test("output is byte-identical across runs and every object has sorted keys (step 3)", (t) => {
    const a = scratch(t);
    const b = scratch(t);
    generateManifests(a);
    generateManifests(b);
    const sortedDeep = (v) => {
      if (Array.isArray(v)) return v.every(sortedDeep);
      if (v === null || typeof v !== "object") return true;
      const keys = Object.keys(v);
      return keys.join("\0") === [...keys].sort().join("\0") && keys.every((k) => sortedDeep(v[k]));
    };
    for (const rel of EXPECTED_FILES) {
      const text = readFileSync(path.join(a, rel), "utf8");
      assert.equal(text, readFileSync(path.join(b, rel), "utf8"), rel);
      assert.ok(text.endsWith("}\n"), rel);
      assert.ok(sortedDeep(JSON.parse(text)), rel + " keys not sorted");
    }
  });

  test("plugin and extension manifests carry name, dev version and the --agent MCP entry", (t) => {
    const dir = scratch(t);
    generateManifests(dir);
    const entry = (id) => ({ "context-mode": { command: "node", args: ["server.mjs", "--agent", id] } });
    // D-M3-F-5: Claude Code runs the plugin server with cwd = the project, so the path names the plugin root.
    const claudeEntry = { "context-mode": { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/server.mjs", "--agent", "claude-code"] } };
    assert.deepEqual(readJson(dir, ".claude-plugin/plugin.json"), {
      description: DEV.description, hooks: "./hooks/claude-code.json", mcpServers: claudeEntry, name: "context-mode", skills: "./claude-code/skills", version: "0.0.0-dev",
    });
    // D-INST-3: `claude plugin marketplace add <package dir>` (what setup runs) needs this file in the npm package.
    assert.deepEqual(readJson(dir, ".claude-plugin/marketplace.json"), {
      name: "context-mode", owner: { name: "context-mode" }, plugins: [{ description: DEV.description, name: "context-mode", skills: "./claude-code/skills", source: "./", version: "0.0.0-dev" }],
    });
    // D-FU-RM-GEMINI-1: Gemini expands ${extensionPath} and ${/} in the manifest and reads hooks only from <ext>/hooks/hooks.json.
    const geminiEntry = { "context-mode": { command: "node", args: ["${extensionPath}${/}server.mjs", "--agent", "gemini"] } };
    assert.deepEqual(readJson(dir, "gemini-extension.json"), { description: DEV.description, mcpServers: geminiEntry, name: "context-mode", version: "0.0.0-dev" });
    // D-FU-RM-QWEN-1: Qwen expands ${extensionPath} and ${/} in the manifest and reads config.hooks (a path relative to the extension).
    const qwenEntry = { "context-mode": { command: "node", args: ["${extensionPath}${/}server.mjs", "--agent", "qwen"] } };
    assert.deepEqual(readJson(dir, "qwen-extension.json"), {
      description: DEV.description, hooks: "hooks/qwen.json", mcpServers: qwenEntry, name: "context-mode", version: "0.0.0-dev",
    });
    assert.deepEqual(readJson(dir, "copilot/plugin.json"), { description: DEV.description, mcpServers: entry("copilot-cli"), name: "context-mode", version: "0.0.0-dev" });
  });

  test("hook files follow each host shape of impl/10 §1.5", (t) => {
    const dir = scratch(t);
    generateManifests(dir);
    const cmd = (id) => "node hook.mjs --agent " + id;
    // D-M3-F-5: Claude Code hooks run with cwd = the project; the command names the plugin root, quoted.
    const claudeCmd = 'node "${CLAUDE_PLUGIN_ROOT}/hook.mjs" --agent claude-code';
    const claude = readJson(dir, "hooks/claude-code.json");
    assert.deepEqual(claude.hooks.PreToolUse, [{ hooks: [{ command: claudeCmd, timeout: 5, type: "command" }], matcher: MATCHERS["claude-code"] }]);
    assert.deepEqual(claude.hooks.PostToolUse, [{ hooks: [{ command: claudeCmd, timeout: 5, type: "command" }], matcher: `^(${CLAUDE_MATCHER_NAMES}|mcp__plugin_context-mode_context-mode__ctx_.*|mcp__.*)$` }]);
    assert.deepEqual(claude.hooks.SessionStart, [{ hooks: [{ command: claudeCmd, timeout: 5, type: "command" }] }]);
    // D-FU-RM-QWEN-1: Qwen replaces only ${CLAUDE_PLUGIN_ROOT} in hook commands.
    const qwenCmd = 'node "${CLAUDE_PLUGIN_ROOT}/hook.mjs" --agent qwen';
    const qwen = readJson(dir, "hooks/qwen.json");
    assert.deepEqual(qwen.hooks.PreToolUse, [{ hooks: [{ command: qwenCmd, timeout: 5, type: "command" }], matcher: MATCHERS.qwen }]);
    assert.deepEqual(qwen.hooks.SessionStart, [{ hooks: [{ command: qwenCmd, timeout: 5, type: "command" }] }]);
    // D-FU-RM-GEMINI-1: Gemini reads hooks only from hooks/hooks.json and expands ${extensionPath} and ${/} in commands.
    const geminiCmd = 'node "${extensionPath}${/}hook.mjs" --agent gemini';
    const gemini = readJson(dir, "hooks/hooks.json");
    // D-FU-GCH-1: no SessionStart; Claude Code also loads hooks/hooks.json and would run it through /bin/sh.
    assert.deepEqual(Object.keys(gemini.hooks), ["AfterTool", "BeforeAgent", "BeforeTool", "PreCompress"]);
    assert.deepEqual(gemini.hooks.BeforeTool, [{ hooks: [{ command: geminiCmd, timeout: 5000, type: "command" }] }]);
    assert.deepEqual(gemini.hooks.BeforeAgent, [{ hooks: [{ command: geminiCmd, timeout: 5000, type: "command" }] }]);
    const copilot = readJson(dir, "hooks/copilot-cli.json");
    assert.equal(copilot.version, 1);
    assert.deepEqual(copilot.hooks.preToolUse, [{ command: cmd("copilot-cli"), timeoutSec: 5, type: "command" }]);
    const vs = readJson(dir, "hooks/vscode.json");
    assert.equal(vs.version, 1);
    assert.deepEqual(Object.keys(vs.hooks), ["PostToolUse", "PreCompact", "PreToolUse", "SessionStart", "UserPromptSubmit"]);
    assert.deepEqual(vs.hooks.PreToolUse, [{ command: cmd("vscode"), timeout: 5, type: "command" }]);
    const kiro = readJson(dir, "hooks/kiro.json");
    assert.equal(kiro.version, "v1");
    // D-HF-KIRO-SHELL-1: one tool-event entry for own MCP tools (@mcp) and one for the native shell tool.
    assert.deepEqual(kiro.hooks.filter((h) => h.trigger === "PreToolUse"), [
      { action: { command: cmd("kiro"), type: "command" }, enabled: true, matcher: "@mcp", name: "context-mode-PreToolUse-mcp", timeout: 5, trigger: "PreToolUse" },
      { action: { command: cmd("kiro"), type: "command" }, enabled: true, matcher: "shell", name: "context-mode-PreToolUse-shell", timeout: 5, trigger: "PreToolUse" },
    ]);
    assert.equal("matcher" in kiro.hooks.find((h) => h.trigger === "UserPromptSubmit"), false);
    const z = readJson(dir, "hooks/zcode.json");
    assert.equal(z.hooks.enabled, true);
    // D-HF-ZCODE-SHAPE-1: ZCode CLI docs usage/09-hooks.md, matcher groups {matcher?, hooks:[...]}.
    assert.deepEqual(z.hooks.events.PreToolUse, [{ hooks: [{ command: cmd("zcode"), timeoutMs: 5000, type: "command" }], matcher: MATCHERS.zcode }]);
  });

  // D-FU-GCH-1: Claude Code loads <plugin>/hooks/hooks.json by default, next to plugin.json "hooks", and runs any entry
  // whose event it knows through /bin/sh, which fails on ${extensionPath}/${/} ("bad substitution"). Hook event names
  // read from the Claude Code 2.1.303 binary.
  const CLAUDE_CODE_EVENTS = ["PreToolUse", "PostToolUse", "PostToolUseFailure", "PostToolBatch", "Notification", "UserPromptSubmit",
    "UserPromptExpansion", "SessionStart", "SessionEnd", "Stop", "StopFailure", "SubagentStart", "SubagentStop", "PreCompact", "PostCompact",
    "PreModelSwitch", "PostModelSwitch", "PermissionRequest", "PermissionDenied", "Setup", "TeammateIdle", "TaskCreated", "TaskCompleted",
    "Elicitation", "ElicitationResult", "ConfigChange", "WorktreeCreate", "WorktreeRemove", "InstructionsLoaded", "CwdChanged", "FileChanged",
    "DirectoryAdded", "MessageDisplay"];
  test("GP1/claude-code-default-hooks-json: no hooks/hooks.json entry Claude Code runs carries ${extensionPath} or ${/}", (t) => {
    const dir = scratch(t);
    generateManifests(dir);
    const hooks = readJson(dir, "hooks/hooks.json").hooks;
    for (const event of Object.keys(hooks)) {
      if (!CLAUDE_CODE_EVENTS.includes(event)) continue;
      const text = JSON.stringify(hooks[event]);
      assert.equal(text.includes("${extensionPath}"), false, event + " runs under Claude Code with ${extensionPath}");
      assert.equal(text.includes("${/}"), false, event + " runs under Claude Code with ${/}");
    }
  });

  test("an unknown installMode is a build-time hard stop (step 4)", (t) => {
    const dir = scratch(t);
    const bad = { ...getAdapter("qwen"), installMode: "floppy" };
    assert.throws(() => generateManifests(dir, undefined, [...ADAPTERS, bad]), { message: "manifest: unknown installMode floppy" });
  });

  // D-FU-RM-PI-1 (ADR-0002 GS7 amended) + ADR-0019 D1 (PO-NPM-2): the out tree holds one package.json, the npm package:
  // name, version, bin, type, engines, files and pi (Pi reads "pi".extensions from the package dir); no dependencies,
  // no scripts, no private.
  const D1_FILES = [
    ".claude-plugin", ".codex-plugin", "SHA256SUMS", "claude-code", "cli.mjs", "codex", "copilot", "fixtures", "gemini-extension.json", "hook.mjs", "hooks",
    "opencode", "pi", "qwen-extension.json", "run.mjs", "search.mjs", "server.mjs", "skills",
  ];
  test("package.json is the D1 npm shape: name, version, bin, type, engines, files, pi (extensions, skills)", (t) => {
    const dir = scratch(t);
    generateManifests(dir, "2.0.0");
    assert.deepEqual(readJson(dir, "package.json"), {
      ...META,
      bin: { "context-mode": "cli.mjs" },
      engines: { node: ">=24.15.0" },
      files: D1_FILES,
      main: "./opencode/plugin.js", // ADR-0023 D-NI-OPENCODE-1
      name: "context-mode",
      pi: { extensions: ["./pi/index.js"], skills: ["./pi/skills"] },
      repository: { type: "git", url: "git+https://github.com/mksglu/context-mode.git" },
      type: "module",
      version: "2.0.0",
    });
    assert.doesNotThrow(() => assertOutPackageJson(readJson(dir, "package.json")));
  });

  test("assertOutPackageJson throws on dependencies, scripts, private or any other key", () => {
    const ok = {
      ...META,
      name: "context-mode", version: "2.0.0", type: "module", bin: { "context-mode": "cli.mjs" }, engines: { node: ">=24.15.0" },
      files: D1_FILES, main: "./opencode/plugin.js", pi: { extensions: ["./pi/index.js"], skills: ["./pi/skills"] },
      repository: { type: "git", url: "git+https://github.com/mksglu/context-mode.git" },
    };
    assert.doesNotThrow(() => assertOutPackageJson(ok));
    assert.throws(() => assertOutPackageJson({ ...ok, dependencies: { "better-sqlite3": "1.0.0" } }), /dependencies/);
    assert.throws(() => assertOutPackageJson({ ...ok, scripts: { postinstall: "node x.js" } }), /scripts/);
    assert.throws(() => assertOutPackageJson({ ...ok, devDependencies: {} }), /devDependencies/);
    assert.throws(() => assertOutPackageJson({ ...ok, private: true }), /private/);
    assert.throws(() => assertOutPackageJson({ ...ok, type: "commonjs" }), /type/);
    assert.throws(() => assertOutPackageJson({ ...ok, bin: { "context-mode": "./cli.mjs" } }), /bin/);
    assert.throws(() => assertOutPackageJson({ ...ok, engines: { node: ">=22.5.0" } }), /engines/);
    assert.throws(() => assertOutPackageJson({ ...ok, files: D1_FILES.slice(1) }), /files/);
    assert.throws(() => assertOutPackageJson({ ...ok, pi: { extensions: ["./pi/index.js"], skills: ["./pi/skills"], prompts: [] } }), /pi/);
    // D-RN-REPO-1: npm provenance (E422) needs repository.url to name the source repo; npm pkg fix form, so it stays a no-op.
    assert.throws(() => assertOutPackageJson({ ...ok, repository: { type: "git", url: "" } }), /repository/);
    assert.throws(() => assertOutPackageJson({ ...ok, repository: { type: "git", url: "https://github.com/mksglu/context-mode" } }), /repository/);
    for (const key of ["description", "keywords", "license", "homepage", "bugs"]) { // D-PKG-META-1: must equal the repo package.json
      assert.throws(() => assertOutPackageJson({ ...ok, [key]: "x" }), new RegExp(key));
    }
    assert.throws(() => assertOutPackageJson({ ...ok, main: "./server.mjs" }), /main/); // ADR-0023 D-NI-OPENCODE-1
    for (const key of ["pi", "bin", "engines", "files", "repository"]) {
      const { [key]: _drop, ...missing } = ok;
      assert.throws(() => assertOutPackageJson(missing), new RegExp(key));
    }
  });
});

describe("ADR-0018 build: package metadata and dependency use", () => {
  // One source of truth for package metadata (D-PKG-META-1). The v2-design package.json is the dev package: the release
  // build (build/manifests.ts) reads description, keywords, license, homepage, bugs, repository from it and takes engines
  // from NODE_MIN, so the two cannot drift. Source-tree plugin manifests must carry the same version and description.
  // Every listed dependency must have a v2 use. The published package stays dependency-free.


  const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const readJson = (...p) => JSON.parse(readFileSync(path.join(REPO, ...p), "utf8"));
  const pkg = readJson("package.json");

  // Host keyword per adapter id (the name users search for).
  const HOST_KEYWORD = { gemini: "gemini-cli", qwen: "qwen-code" };
  const GENERIC_KEYWORDS = ["mcp", "context-window", "sandbox", "fts5", "pi-package"]; // pi-package: Pi package gallery tag
  const RELEASE_VERSION = "2.0.0-next.8";

  function release(t) {
    const dir = mkdtempSync(path.join(tmpdir(), "cm-pkg-meta-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    generateManifests(dir, RELEASE_VERSION);
    return dir;
  }
  const out = (dir, rel) => JSON.parse(readFileSync(path.join(dir, rel), "utf8"));

  test("package-meta: dev package.json is the v2 dev package (version, engines from NODE_MIN, no v1 fields)", () => {
    assert.ok(isReleaseVersion(pkg.version), "version " + pkg.version + " is not a release version");
    assert.ok(pkg.version.startsWith("2."), "version " + pkg.version + " is not v2");
    assert.deepEqual(pkg.engines, { node: ">=" + NODE_MIN });
    assert.equal(pkg.license, "Elastic-2.0");
    assert.equal(pkg.type, "module");
    assert.equal(pkg.dependencies, undefined, "bundled packages are devDependencies; the published package has no dependencies");
    // bin/main/exports name files that exist only in the release tree; if declared they must equal the release values.
    assert.ok(pkg.bin === undefined || JSON.stringify(pkg.bin) === JSON.stringify({ "context-mode": "cli.mjs" }), "bin");
    assert.ok(pkg.main === undefined || pkg.main === "./opencode/plugin.js", "main " + pkg.main);
    assert.equal(pkg.exports, undefined, "exports points at the v1 build/ tree");
    assert.equal(pkg.packageManager, undefined, "v2 installs with npm");
  });

  test("package-meta: description is short, names the host count, has no unmeasured number", () => {
    assert.ok(pkg.description.length <= 160, "description is " + pkg.description.length + " chars");
    assert.ok(pkg.description.includes(ADAPTERS.length + " coding agents"), pkg.description);
    assert.ok(!pkg.description.includes("%"), "no percentage: it is not in docs/benchmarks");
    assert.ok(!pkg.description.includes("98"), "v1 claim");
    assert.ok(!/openclaw/i.test(pkg.description));
  });

  test("package-meta: keywords are the supported hosts plus the generic four, nothing else", () => {
    const hosts = ADAPTERS.map((r) => HOST_KEYWORD[r.id] ?? r.id);
    assert.deepEqual([...pkg.keywords].sort(), [...hosts, ...GENERIC_KEYWORDS].sort());
  });

  test("package-meta: homepage, repository, bugs name this repo in npm-normal form", () => {
    assert.equal(pkg.homepage, "https://github.com/mksglu/context-mode#readme");
    assert.deepEqual(pkg.repository, { type: "git", url: "git+https://github.com/mksglu/context-mode.git" });
    assert.deepEqual(pkg.bugs, { url: "https://github.com/mksglu/context-mode/issues" });
  });

  test("package-meta: release package.json carries the dev package.json fields, never a hand copy", (t) => {
    const rel = out(release(t), "package.json");
    for (const key of ["description", "keywords", "license", "homepage", "bugs", "repository"]) {
      assert.deepEqual(rel[key], pkg[key], key + " differs between the release build and package.json");
    }
    assert.deepEqual(rel.engines, pkg.engines);
    assert.equal(rel.version, RELEASE_VERSION, "release version comes from --version, not package.json");
    assert.deepEqual(rel.bin, { "context-mode": "cli.mjs" });
    assert.equal(rel.main, "./opencode/plugin.js");
    assert.equal(rel.dependencies, undefined);
    assert.equal(rel.devDependencies, undefined);
  });

  test("package-meta: generated manifests carry the one description and the release version", (t) => {
    const dir = release(t);
    const claude = out(dir, ".claude-plugin/plugin.json");
    const market = out(dir, ".claude-plugin/marketplace.json");
    const codex = out(dir, ".codex-plugin/plugin.json");
    for (const [label, m] of [["claude plugin", claude], ["codex plugin", codex], ["gemini", out(dir, "gemini-extension.json")],
      ["qwen", out(dir, "qwen-extension.json")], ["copilot", out(dir, "copilot/plugin.json")]]) {
      assert.equal(m.description, pkg.description, label + " description");
      assert.equal(m.version, RELEASE_VERSION, label + " version");
    }
    assert.equal(market.plugins[0].description, pkg.description, "marketplace description");
    assert.equal(market.plugins[0].version, RELEASE_VERSION);
  });

  test("package-meta: source-tree plugin manifests match package.json on version, description, keywords", () => {
    const claude = readJson(".claude-plugin", "plugin.json");
    const market = readJson(".claude-plugin", "marketplace.json");
    const codex = readJson(".codex-plugin", "plugin.json");
    for (const [label, m] of [["claude plugin.json", claude], ["codex plugin.json", codex], ["marketplace plugin", market.plugins[0]]]) {
      assert.equal(m.version, pkg.version, label + " version");
      assert.equal(m.description, pkg.description, label + " description");
      assert.deepEqual(m.keywords, pkg.keywords, label + " keywords");
    }
    assert.equal(market.metadata.version, pkg.version, "marketplace metadata version");
    assert.ok(!JSON.stringify(codex.interface ?? {}).includes("98%"), "codex interface carries the v1 claim");
  });

  // Import forms that name a package: a plain string test per form, no pattern engine.
  function names(dep, text) {
    for (const q of ['"', "'"]) {
      for (const head of ["from " + q, "import(" + q, "require(" + q, "import " + q]) {
        if (text.includes(head + dep + q) || text.includes(head + dep + "/")) return true;
      }
    }
    return false;
  }
  function* files(dir) {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".git" || name === "release-out") continue;
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) yield* files(p);
      else if (/\.(mjs|ts|js|cjs|yml)$/.test(name)) yield p;
    }
  }
  const SCAN_DIRS = ["src", "build", "scripts", "tests/v2", "e2e", ".github"];
  const SELF = fileURLToPath(import.meta.url);
  const SCANNED = SCAN_DIRS.flatMap((d) => [...files(path.join(REPO, d))]).filter((f) => f !== SELF).map((f) => readFileSync(f, "utf8"));
  // Tools with no import: named by a package.json script, or (types) by the code they type.
  const TOOL_USE = {
    typescript: () => pkg.scripts.typecheck.startsWith("tsc "),
    "@types/node": () => SCANNED.some((s) => s.includes('from "node:')),
  };

  test("package-meta: every dependency and devDependency has a v2 use", () => {
    const listed = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    assert.ok(listed.length > 0);
    const unused = listed.filter((dep) => !(TOOL_USE[dep] ? TOOL_USE[dep]() : SCANNED.some((s) => names(dep, s))));
    assert.deepEqual(unused, [], "no v2 use found for: " + unused.join(", "));
  });
});

describe("ADR-0019 build: host skills", () => {
  // D-HQ-SKILLS-2: for every host, the skill text that host ends up with names that host's real tool name and no
  // other host's. Package hosts read the built dir of their skill channel; home-dir hosts get what setup writes
  // (renderSkill of the built package's skill source with the host prefixes, as planSkills does).


  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const SKILLS = ["ctx-doctor", "ctx-stats", "ctx-upgrade"];
  const SOURCE = Object.fromEntries(SKILLS.map((s) => [s, readFileSync(path.join(REPO, "skills", s, "SKILL.md"), "utf8")]));

  // One build for both tests. --generated-only first, as the CI gate does: parallel test files that build too would
  // otherwise delete src/prompt/_generated.ts under this build (D-M5-P2-5).
  let scratch;
  let out;
  before(() => {
    scratch = mkdtempSync(path.join(tmpdir(), "cm-v2-host-skills-"));
    out = path.join(scratch, "out");
    const build = (...args) => spawnSync(process.execPath, [path.join(REPO, "build", "build.mjs"), ...args], { encoding: "utf8" });
    assert.equal(build("--generated-only").status, 0);
    const r = build("--out", out);
    assert.equal(r.status, 0, r.stderr);
  });
  after(() => rmSync(scratch, { recursive: true, force: true }));

  // The tool names the source skill text uses, and the names a host may have in its text.
  const toolsIn = (text) => TOOL_ORDER.filter((tool) => text.includes(tool));

  function shipped(out, id) {
    const reg = buildRegistry({ home: path.join(out, "no-home"), pkgDir: out, env: {} }).find((r) => r.id === id);
    const s = reg.skillInstall;
    if (s.kind === "package") {
      // D-HQ-SKILLS-3: hosts that read the same package dir share one text, so it names every sharing host's tool.
      const sharers = ADAPTERS.filter((a) => a.skillChannel.kind === "package" && a.skillChannel.path === s.via);
      return { prefixes: [...new Set(sharers.map((a) => a.toolNamePrefix))],
        texts: Object.fromEntries(SKILLS.map((n) => [n, readFileSync(path.join(out, s.via, n, "SKILL.md"), "utf8")])) };
    }
    return { prefixes: s.prefixes, texts: Object.fromEntries(s.files.map((f) => [f.name, renderSkill(readFileSync(f.src, "utf8"), s.prefixes)])) };
  }

  test("[D-HQ-SKILLS-2] every host's shipped skill text names exactly its own real tool names", () => {
    for (const row of ADAPTERS) {
      const { prefixes, texts } = shipped(out, row.id);
      assert.deepEqual(Object.keys(texts).sort(), SKILLS, row.id);
      for (const name of SKILLS) {
        let rest = texts[name];
        for (const tool of toolsIn(SOURCE[name])) {
          for (const p of prefixes) {
            assert.ok(rest.includes(p + tool), `${row.id} ${name} names ${p + tool}`);
            rest = rest.split(p + tool).join("");
          }
        }
        assert.equal(rest.includes("ctx_"), false, `${row.id} ${name} names a tool that is not this host's: ${rest}`);
      }
    }
  });

  test("[D-HQ-SKILLS-2] claude-code ships its own skills dir and the plugin reads only that dir", () => {
    const claude = ADAPTERS.find((a) => a.id === "claude-code");
    assert.equal(claude.skillChannel.path, "claude-code/skills");
    const plugin = JSON.parse(readFileSync(path.join(out, ".claude-plugin", "plugin.json"), "utf8"));
    assert.equal(plugin.skills, "./claude-code/skills");
    // Claude Code adds a plugin.json skills dir to the default skills/ (which holds Gemini's text), so the marketplace entry
    // lists the dir too; for a source "./" entry that stops the default scan (plugins reference, checked on claude 2.1.274).
    const entry = JSON.parse(readFileSync(path.join(out, ".claude-plugin", "marketplace.json"), "utf8")).plugins[0];
    assert.equal(entry.skills, "./claude-code/skills");
  });

  // N5 (2.0.0-next.5 live runs): codex ctx-stats said "mcp_context-mode_mcp__context_mode__ctx_stats". Setup rendered the
  // home-dir skills from the package skills/ dir, which build.mjs already rendered with Gemini's prefix, so the prefix
  // doubled. Expected names: each host's real tool name as the host lists it (adapters TOOL_NAME_PREFIX, D-HQ-COPILOT-NAMES-2).
  const CTX_STATS_NAME = {
    "claude-code": "mcp__plugin_context-mode_context-mode__ctx_stats",
    codex: "mcp__context_mode__ctx_stats",
    gemini: "mcp_context-mode_ctx_stats or mcp__context-mode__ctx_stats", // D-HQ-SKILLS-3: gemini and qwen share <extension>/skills
    qwen: "mcp_context-mode_ctx_stats or mcp__context-mode__ctx_stats",
    "copilot-cli": "context-mode-ctx_stats", // D-HQ-COPILOT-NAMES-3: one name, Copilot CLI 1.0.103 lists MCP tools <server>-<tool>
    vscode: "mcp_context-mode_ctx_stats",
    kiro: "mcp_context-mode_ctx_stats",
    zcode: "mcp__context-mode__ctx_stats",
    pi: "ctx_stats",
    opencode: "ctx_stats",
  };

  test("[D-N5-SKILL-1] the built package's ctx-stats skill names each host's real tool once, never a doubled prefix", () => {
    for (const row of ADAPTERS) {
      const { texts } = shipped(out, row.id);
      assert.ok(texts["ctx-stats"].includes("Call the " + CTX_STATS_NAME[row.id] + " tool "), `${row.id}: ${texts["ctx-stats"]}`);
    }
  });

  // D-HQ-SKILLS-3 (live, Qwen Code 0.26.1 and Gemini CLI 0.65.0): both hosts load skills from the fixed path
  // <extension>/skills and ignore a skills key in the manifest, and their native install commands take the repo or package
  // root. So the one shipped skills/ dir is what both hosts load; qwen got Gemini's text (mcp_context-mode_ctx_*), which is
  // not a qwen tool. The text now names both hosts' tools, and setup no longer writes a second qwen copy to ~/.qwen/skills.
  test("[D-HQ-SKILLS-3] gemini and qwen both load <extension>/skills, so that dir names the tool of each host", () => {
    const qwen = ADAPTERS.find((a) => a.id === "qwen");
    const gemini = ADAPTERS.find((a) => a.id === "gemini");
    assert.deepEqual(qwen.skillChannel, { kind: "package", path: "skills" });
    assert.deepEqual(gemini.skillChannel, { kind: "package", path: "skills" });
    for (const name of SKILLS) {
      let rest = readFileSync(path.join(out, "skills", name, "SKILL.md"), "utf8");
      for (const tool of toolsIn(SOURCE[name])) {
        for (const p of [gemini.toolNamePrefix, qwen.toolNamePrefix]) {
          assert.ok(rest.includes(p + tool), `${name} names ${p + tool}`);
          rest = rest.split(p + tool).join("");
        }
      }
      assert.equal(rest.includes("ctx_"), false, `${name} names a tool that is neither gemini's nor qwen's: ${rest}`);
    }
  });

  // D-HQ-COPILOT-NAMES-3 (2.0.0-next.5): the copilot-cli ctx-stats skill hedged between two tool names, because copilot-cli and
  // vscode wrote one shared ~/.copilot/skills. Copilot CLI 1.0.103 (runtime.node strings "github-mcp-server-search_code",
  // "playwright-browser_take_screenshot") names an MCP tool <server>-<tool>, so ours is context-mode-ctx_stats and nothing else.
  // The CLI loads personal skills from ~/.copilot/skills first and ~/.agents/skills next and skips a later same-name skill
  // ("Skipped duplicate skill name ...; a higher-priority entry with the same name was already loaded"), so copilot-cli owns
  // ~/.copilot/skills and vscode writes ~/.agents/skills: each skill file names one host's tool.
  test("[D-HQ-COPILOT-NAMES-3] every shipped copilot-cli text names context-mode-ctx_* and never the VS Code name", () => {
    const copilot = ADAPTERS.find((a) => a.id === "copilot-cli");
    const vscode = ADAPTERS.find((a) => a.id === "vscode");
    assert.equal(copilot.toolNamePrefix, "context-mode-");
    assert.deepEqual(copilot.skillChannel, { kind: "home-dir", path: ".copilot/skills" });
    assert.deepEqual(vscode.skillChannel, { kind: "home-dir", path: ".agents/skills" });
    const { prefixes, texts } = shipped(out, "copilot-cli");
    assert.deepEqual(prefixes, ["context-mode-"]);
    for (const name of SKILLS) {
      assert.equal(texts[name].includes(" or "), false, `${name} hedges between two names: ${texts[name]}`);
      assert.equal(texts[name].includes("mcp_context-mode_"), false, `${name} names the VS Code tool: ${texts[name]}`);
      const tool = name.replace("ctx-", "ctx_");
      assert.equal(texts[name].split("context-mode-" + tool).length - 1, 1, `${name} names context-mode-${tool} once`);
    }
    // The hook deny text (exec and web) and the compact pointer carry the same single name.
    for (const kind of ["curl", "webfetch"]) {
      const deny = denyMessage(kind, "x", copilot);
      assert.ok(deny.includes("context-mode-ctx_"), deny);
      assert.equal(deny.includes("mcp_context-mode_"), false, deny);
    }
    const hint = prefixToolNames(COMPACT_POINTER_LINE, copilot.toolNamePrefix);
    assert.ok(hint.includes("context-mode-ctx_") && !hint.includes("mcp_context-mode_"), hint);
  });

  // D-N7-ZCODE-NAMES-1 (2.0.0-next.6 skillOk=false for zcode). ZCode names an MCP tool mcp__<server>__<tool>:
  //  - https://zcode.z.ai/en/docs/subagents ("Tools and MCP"): "add each tool's full name to tools, in the form mcp__<server>__<tool>"
  //  - github.com/zai-org/ZCode apps/zcode-cli/docs/design/v2/mcp.md: "Model-facing tool names: mcp__<server>__<tool>"
  //  - apps/zcode-cli/packages/core/src/mcp/name.ts (toModelVisibleMcpNamePart) and packages/adapters/src/mcp/descriptor.ts:
  //    name: `mcp__${sanitize(server)}__${sanitize(tool)}`, sanitize = every char outside [a-zA-Z0-9_-] becomes "_", runs of "_"
  //    collapse to one. A hyphen stays, so server key "context-mode" gives mcp__context-mode__ctx_stats (not context_mode).
  // This test applies that rule to our server key (setup writes mcp.servers.context-mode) and checks every zcode text uses it.
  function zcodeVisible(name) {
    let out = "";
    for (const ch of name) {
      const ok = (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9") || ch === "_" || ch === "-";
      const c = ok ? ch : "_";
      if (!(c === "_" && out.endsWith("_"))) out += c;
    }
    return out === "" ? "unknown" : out;
  }

  test("[D-N7-ZCODE-NAMES-1] the zcode prefix, skills, hook deny texts, compact pointer and matcher use the documented mcp__<server>__<tool> name", () => {
    const zcode = ADAPTERS.find((a) => a.id === "zcode");
    const documented = "mcp__" + zcodeVisible(SERVER_KEY) + "__";
    assert.equal(documented, "mcp__context-mode__");
    assert.equal(zcode.toolNamePrefix, documented);
    const wrong = ["mcp__context_mode__", "mcp_context-mode_", "context-mode-ctx_", "mcp__plugin_"];
    const { prefixes, texts } = shipped(out, "zcode");
    assert.deepEqual(prefixes, [documented]);
    for (const name of SKILLS) {
      const tool = name.replace("ctx-", "ctx_");
      assert.equal(texts[name].includes(" or "), false, `${name} hedges between two names: ${texts[name]}`);
      assert.equal(texts[name].split(documented + tool).length - 1 >= 1, true, `${name} names ${documented}${tool}`);
      for (const w of wrong) assert.equal(texts[name].includes(w), false, `${name} names ${w}: ${texts[name]}`);
    }
    const hookTexts = [denyMessage("curl", "x", zcode), denyMessage("webfetch", "x", zcode), prefixToolNames(COMPACT_POINTER_LINE, zcode.toolNamePrefix)];
    for (const t of hookTexts) {
      assert.ok(t.includes(documented + "ctx_"), t);
      for (const w of wrong) assert.equal(t.includes(w), false, `${w} in ${t}`);
    }
    const matcher = composeMatcher(zcode, "PreToolUse");
    assert.ok(matcher.includes(documented + "ctx_"), matcher);
    for (const w of wrong) assert.equal(matcher.includes(w), false, `${w} in ${matcher}`);
  });
});

describe("ADR-0019 build: npm package", () => {
  // ADR-0019 Owner decisions D1 (npm package shape) and D4 (v1 CLI forms), PO-NPM-2. Builds the real release tree
  // into a scratch dir once, then checks package.json, SHA256SUMS, the npm pack tarball and cli.mjs.

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const DEV = JSON.parse(readFileSync(path.join(REPO, "package.json"), "utf8")); // D-PKG-META-1: shared fields come from here
  const FIXTURE = JSON.parse(readFileSync(path.join(REPO, "e2e", "fixtures", "hook-roundtrip.json"), "utf8"));
  const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
  let out;
  let scratch;

  before(() => {
    scratch = mkdtempSync(path.join(tmpdir(), "cm-v2-npm-"));
    out = path.join(scratch, "out");
    const r = spawnSync(process.execPath, [path.join(REPO, "build", "build.mjs"), "--out", out, "--version", "2.0.0"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  });
  after(() => rmSync(scratch, { recursive: true, force: true }));

  const sums = () =>
    readFileSync(path.join(out, "SHA256SUMS"), "utf8").split("\n").filter((l) => l !== "").map((l) => [l.slice(66), l.slice(0, 64)]);
  const cli = (args, input) => spawnSync(process.execPath, [path.join(out, "cli.mjs"), ...args], { encoding: "utf8", input, env: { ...process.env, NO_COLOR: "1" } });

  test("[M7] build/npm-d1-shape: release-out/package.json is the D1 package (bin cli.mjs, engines, files = the tree, pi kept)", () => {
    const pkg = JSON.parse(readFileSync(path.join(out, "package.json"), "utf8"));
    const top = readdirSync(out).filter((n) => n !== "package.json").sort();
    assert.deepEqual(pkg, {
      bugs: DEV.bugs,
      description: DEV.description,
      homepage: DEV.homepage,
      keywords: DEV.keywords,
      license: DEV.license,
      bin: { "context-mode": "cli.mjs" },
      engines: { node: ">=24.15.0" },
      files: top,
      main: "./opencode/plugin.js", // ADR-0023 D-NI-OPENCODE-1: OpenCode imports the plugin by package name
      name: "context-mode",
      pi: { extensions: ["./pi/index.js"], skills: ["./pi/skills"] },
      repository: { type: "git", url: "git+https://github.com/mksglu/context-mode.git" }, // D-RN-REPO-1
      type: "module",
      version: "2.0.0",
    });
    for (const key of ["dependencies", "scripts", "private", "devDependencies", "optionalDependencies"]) assert.ok(!(key in pkg), key);
  });

  test("[M7] build/npm-sums-cover-entry: SHA256SUMS lists package.json and cli.mjs", () => {
    const names = sums().map(([n]) => n);
    assert.ok(names.includes("package.json"));
    assert.ok(names.includes("cli.mjs"));
  });

  test("[M7] build/npm-pack-equals-sums: npm pack file list and sha256 equal SHA256SUMS (plus SHA256SUMS itself)", () => {
    const dest = path.join(scratch, "pack");
    const p = spawnSync(NPM, ["pack", "--json", "--pack-destination", (spawnSync("mkdir", ["-p", dest]), dest)], { cwd: out, encoding: "utf8", shell: process.platform === "win32" });
    assert.equal(p.status, 0, p.stderr);
    const [info] = JSON.parse(p.stdout);
    assert.equal(info.name, "context-mode");
    assert.equal(info.version, "2.0.0");
    const listed = info.files.map((f) => f.path).sort();
    const expected = [...sums().map(([n]) => n), "SHA256SUMS"].sort();
    assert.deepEqual(listed, expected);
    const ex = path.join(scratch, "x");
    spawnSync("mkdir", ["-p", ex]);
    const t = spawnSync("tar", ["-xzf", path.join(dest, info.filename), "-C", ex], { encoding: "utf8" });
    assert.equal(t.status, 0, t.stderr);
    for (const [rel, hex] of sums()) {
      assert.equal(createHash("sha256").update(readFileSync(path.join(ex, "package", rel))).digest("hex"), hex, rel);
    }
    const packed = JSON.parse(readFileSync(path.join(ex, "package", "package.json"), "utf8"));
    assert.deepEqual(packed.bin, { "context-mode": "cli.mjs" }, "npm must keep the bin entry");
  });

  test("[M7] cli/help: --help prints usage with examples on stdout, exit 0; no args too", () => {
    for (const args of [["--help"], ["-h"], []]) {
      const r = cli(args);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /Usage: context-mode <command>/);
      assert.match(r.stdout, /Examples:/);
      assert.match(r.stdout, /server/);
      assert.match(r.stdout, /hook --agent <id>/);
    }
  });

  test("[M7] cli/version: --version prints the package.json version", () => {
    const r = cli(["--version"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "2.0.0\n");
  });

  test("[M7] cli/unknown: an unknown command is a usage error, exit 2, message on stderr", () => {
    const r = cli(["frobnicate"]);
    assert.equal(r.status, 2);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /unknown command "frobnicate"/);
  });

  for (const [v1Platform, agent] of [["claude-code", "claude-code"], ["codex", "codex"]]) {
    test(`[M7] cli/hook-v1-form: "hook ${v1Platform} PreToolUse" gives the same answer as hook.mjs --agent ${agent} (D4)`, () => {
      const input = JSON.stringify(FIXTURE[agent].payload);
      const direct = spawnSync(process.execPath, [path.join(out, "hook.mjs"), "--agent", agent], { encoding: "utf8", input });
      const v1 = cli(["hook", v1Platform, FIXTURE[agent].event], input);
      const v2 = cli(["hook", "--agent", agent], input);
      assert.equal(v1.status, direct.status);
      assert.equal(v1.stdout, direct.stdout);
      assert.equal(v2.status, direct.status);
      assert.equal(v2.stdout, direct.stdout);
    });
  }

  test("[M7] cli/hook-v1-platform-map: every v1 platform name maps to its v2 agent id", async () => {
    const { V1_PLATFORM_AGENT } = await import("../../src/entries/cli.ts");
    assert.deepEqual(V1_PLATFORM_AGENT, {
      "claude-code": "claude-code",
      codex: "codex",
      "copilot-cli": "copilot-cli",
      "gemini-cli": "gemini",
      kiro: "kiro",
      "qwen-code": "qwen",
      "vscode-copilot": "vscode",
    });
  });

  test("[M7] cli/hook-v1-unknown-platform: fails open, exit 0, empty stdout, one stderr line", () => {
    const r = cli(["hook", "nope-agent", "PreToolUse"], "{}");
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /nope-agent/);
  });

  for (const cmd of ["server", "mcp"]) {
    test(`[M7] cli/${cmd}: "${cmd}" runs server.mjs and answers MCP initialize on stdio`, () => {
      const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } };
      const r = spawnSync(process.execPath, [path.join(out, "cli.mjs"), cmd, "--agent", "claude-code"], {
        encoding: "utf8", input: JSON.stringify(init) + "\n", timeout: 20000, env: { ...process.env, HOME: scratch, USERPROFILE: scratch, CONTEXT_MODE_DIR: path.join(scratch, "cm") },
      });
      const line = r.stdout.split("\n").find((l) => l.includes('"id":1'));
      assert.ok(line, r.stderr);
      assert.equal(JSON.parse(line).result.serverInfo.name, "context-mode");
    });
  }

  test("[M7] cli/executable-entry: cli.mjs starts with a node shebang", () => {
    assert.ok(readFileSync(path.join(out, "cli.mjs"), "utf8").startsWith("#!/usr/bin/env node\n"));
    assert.ok(statSync(path.join(out, "cli.mjs")).size > 0);
  });
});

describe("ADR-0023 build: native host manifests", () => {
  // ADR-0023 (native install per agent), step 2. Builds the release tree, packs it with npm, unpacks the tarball,
  // and checks that every manifest a host's native install command reads is in the packed package and names only
  // files the package ships. Then writes the main-branch tree the release workflow commits (Claude Code plugin
  // subfolder + both marketplace files) from the unpacked package and checks it the same way.

  const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
  const VERSION = "2.0.0";
  const COMMAND_SKILLS = ["ctx-doctor", "ctx-stats", "ctx-upgrade"];
  let scratch;
  let pkg; // the unpacked npm tarball (package/)
  let main; // the main-branch tree written from it

  before(() => {
    scratch = mkdtempSync(path.join(tmpdir(), "cm-v2-native-"));
    const out = path.join(scratch, "out");
    const b = spawnSync(process.execPath, [path.join(REPO, "build", "build.mjs"), "--out", out, "--version", VERSION], { encoding: "utf8" });
    assert.equal(b.status, 0, b.stderr);
    const dest = path.join(scratch, "pack");
    mkdirSync(dest);
    const p = spawnSync(NPM, ["pack", "--json", "--pack-destination", dest], { cwd: out, encoding: "utf8", shell: process.platform === "win32" });
    assert.equal(p.status, 0, p.stderr);
    const [info] = JSON.parse(p.stdout);
    const ex = path.join(scratch, "x");
    mkdirSync(ex);
    const t = spawnSync("tar", ["-xzf", path.join(dest, info.filename), "-C", ex], { encoding: "utf8" });
    assert.equal(t.status, 0, t.stderr);
    pkg = path.join(ex, "package");
    main = path.join(scratch, "main");
    mkdirSync(main);
    const m = spawnSync(process.execPath, [path.join(REPO, "build", "main-tree.mjs"), "--pkg", pkg, "--repo", main, "--version", VERSION], { encoding: "utf8" });
    assert.equal(m.status, 0, m.stderr);
  });
  after(() => rmSync(scratch, { recursive: true, force: true }));

  const json = (root, rel) => JSON.parse(readFileSync(path.join(root, rel), "utf8"));
  const isFile = (root, rel) => existsSync(path.join(root, rel)) && statSync(path.join(root, rel)).isFile();
  const ROOT_VARS = ["${CLAUDE_PLUGIN_ROOT}/", "${PLUGIN_ROOT}/", "${extensionPath}${/}", "./"];
  const stripRoot = (raw) => {
    const p = raw.split('"').join("");
    const root = ROOT_VARS.find((r) => p.startsWith(r));
    return root === undefined ? p : p.slice(root.length);
  };
  // Every ".mjs"/".js" token of a hook command line ("node <file> --agent <id>") or a server args list.
  const fileTokens = (tokens) => tokens.map(stripRoot).filter((t) => t.endsWith(".mjs") || t.endsWith(".js"));
  function hookCommands(value, out = []) {
    if (Array.isArray(value)) for (const v of value) hookCommands(v, out);
    else if (value !== null && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (k === "command" && typeof v === "string") out.push(v);
        else hookCommands(v, out);
      }
    }
    return out;
  }
  function assertServers(root, servers, label) {
    const entry = servers["context-mode"];
    assert.ok(entry, label + ": mcpServers.context-mode");
    assert.equal(entry.command, "node", label);
    const files = fileTokens(entry.args);
    assert.equal(files.length, 1, label + ": one server file in " + JSON.stringify(entry.args));
    assert.ok(isFile(root, files[0]), label + ": server file " + files[0] + " shipped");
  }
  function assertHooks(root, rel, label) {
    assert.ok(isFile(root, rel), label + ": hook file " + rel + " shipped");
    const cmds = hookCommands(json(root, rel));
    assert.ok(cmds.length > 0, label + ": hook commands in " + rel);
    for (const c of cmds) {
      const files = fileTokens(c.split(" "));
      assert.equal(files.length, 1, label + ": one file in " + c);
      assert.ok(isFile(root, files[0]), label + ": hook bundle " + files[0] + " shipped");
    }
  }
  function assertSkills(root, dir, prefix, label) {
    for (const name of COMMAND_SKILLS) {
      const rel = path.join(stripRoot(dir), name, "SKILL.md");
      assert.ok(isFile(root, rel), label + ": skill " + rel + " shipped");
      if (prefix !== "") assert.ok(readFileSync(path.join(root, rel), "utf8").includes(prefix + "ctx_"), label + ": " + rel + " names " + prefix + "ctx_*");
    }
  }

  test("[ADR-0023] native/claude-code: packed .claude-plugin/plugin.json names shipped server, hooks and skills", () => {
    const m = json(pkg, ".claude-plugin/plugin.json");
    assert.equal(m.name, "context-mode");
    assert.equal(m.version, VERSION);
    assertServers(pkg, m.mcpServers, "claude-code");
    assertHooks(pkg, stripRoot(m.hooks), "claude-code");
    assertSkills(pkg, m.skills, "mcp__plugin_context-mode_context-mode__", "claude-code");
  });

  test("[ADR-0023] native/codex: packed .codex-plugin/plugin.json names shipped mcp.json, hooks.json and codex-named skills", () => {
    const m = json(pkg, ".codex-plugin/plugin.json");
    assert.equal(m.name, "context-mode");
    assert.equal(m.version, VERSION);
    assert.ok(isFile(pkg, stripRoot(m.mcpServers)), "codex: mcpServers file " + m.mcpServers);
    const mcp = json(pkg, stripRoot(m.mcpServers));
    assertServers(pkg, mcp.mcpServers, "codex");
    assert.ok(mcp.mcpServers["context-mode"].args.includes("codex"), "codex: server runs with --agent codex");
    assertHooks(pkg, stripRoot(m.hooks), "codex");
    for (const c of hookCommands(json(pkg, stripRoot(m.hooks)))) assert.ok(c.includes("${PLUGIN_ROOT}/"), "codex: hook path is plugin-root based: " + c);
    assertSkills(pkg, m.skills, "mcp__context_mode__", "codex");
  });

  // W-CODEX-7 (proven live, codex-cli 0.156.1, root path with a space): Codex expands ${PLUGIN_ROOT} in a hook command
  // (inside the quotes, one token) and sets the MCP server cwd to the plugin root for cwd ".", but passes ${PLUGIN_ROOT}
  // in MCP args through as a literal. So hooks may use the variable, and the server entry must stay relative.
  // Quote-aware split, no regex: a double-quoted run is one token (what cmd.exe, PowerShell and sh all do here).
  function splitQuoted(line) {
    const out = []; let cur = ""; let quoted = false; let has = false;
    for (const ch of line) {
      if (ch === '"') { quoted = !quoted; has = true; continue; }
      if (ch === " " && !quoted) { if (has) out.push(cur); cur = ""; has = false; continue; }
      cur += ch; has = true;
    }
    if (has) out.push(cur);
    return out;
  }
  test("[W-CODEX-7] native/codex: hook command is node + one quoted ${PLUGIN_ROOT} token; a Windows root with a space stays one token", () => {
    const winRoot = "C:\\Users\\Jane Doe\\.codex\\plugins\\cache\\context-mode\\context-mode\\2.0.0";
    const cmds = hookCommands(json(pkg, ".codex-plugin/hooks.json"));
    assert.ok(cmds.length > 0);
    for (const c of cmds) {
      const tokens = splitQuoted(c.split("${PLUGIN_ROOT}").join(winRoot));
      assert.deepEqual(tokens, ["node", winRoot + "/hook.mjs", "--agent", "codex"], c);
    }
  });
  test("[W-CODEX-7] native/codex: mcp.json keeps cwd \".\" and relative args (Codex does not expand ${...} in args)", () => {
    const s = json(pkg, ".codex-plugin/mcp.json").mcpServers["context-mode"];
    assert.equal(s.cwd, ".");
    assert.equal(s.command, "node");
    assert.ok(s.args[0].startsWith("./"), "server path is relative to the plugin root: " + s.args[0]);
    for (const a of s.args) assert.ok(!a.includes("${"), "no placeholder in args: " + a);
  });

  test("[ADR-0023] native/gemini+qwen: packed extension manifests name shipped server and hooks; no context file", () => {
    const g = json(pkg, "gemini-extension.json");
    assert.equal(g.version, VERSION);
    assert.ok(!("contextFileName" in g), "gemini: no contextFileName (ADR-0023 D5)");
    assertServers(pkg, g.mcpServers, "gemini");
    assertHooks(pkg, "hooks/hooks.json", "gemini"); // Gemini loads <extension>/hooks/hooks.json
    assertSkills(pkg, "skills", "mcp_context-mode_", "gemini"); // Gemini loads <extension>/skills
    const q = json(pkg, "qwen-extension.json");
    assert.equal(q.version, VERSION);
    assertServers(pkg, q.mcpServers, "qwen");
    assertHooks(pkg, stripRoot(q.hooks), "qwen");
    for (const name of ["GEMINI.md", "QWEN.md", "CLAUDE.md", "AGENTS.md"]) assert.ok(!existsSync(path.join(pkg, name)), "no instruction file " + name);
  });

  test("[ADR-0023] native/pi+opencode: packed package.json pi entries and the main entry (OpenCode plugin by package name) are shipped", () => {
    const p = json(pkg, "package.json");
    assert.equal(p.version, VERSION);
    for (const rel of p.pi.extensions) assert.ok(isFile(pkg, stripRoot(rel)), "pi extension " + rel);
    for (const dir of p.pi.skills) assertSkills(pkg, dir, "", "pi");
    assert.equal(typeof p.main, "string", "opencode: package.json main (OpenCode imports the plugin by package name)");
    assert.equal(stripRoot(p.main), "opencode/plugin.js");
    assert.ok(isFile(pkg, stripRoot(p.main)), "opencode: main " + p.main + " shipped");
  });

  test("[ADR-0023] native/claude-code-main: main tree marketplace points at plugins/claude-code, which holds the full plugin", () => {
    const mk = json(main, ".claude-plugin/marketplace.json");
    assert.equal(mk.name, "context-mode");
    assert.equal(typeof mk.owner.name, "string");
    assert.equal(mk.plugins.length, 1);
    const [entry] = mk.plugins;
    assert.equal(entry.name, "context-mode", "entry name equals plugin.json name (/plugin install context-mode@context-mode)");
    assert.equal(entry.source, "./plugins/claude-code");
    assert.equal(entry.version, VERSION);
    const root = path.join(main, "plugins", "claude-code");
    const m = json(root, ".claude-plugin/plugin.json");
    assert.equal(m.name, "context-mode");
    assert.equal(m.version, VERSION);
    assertServers(root, m.mcpServers, "claude-code-main");
    assertHooks(root, stripRoot(m.hooks), "claude-code-main");
    assertSkills(root, m.skills, "mcp__plugin_context-mode_context-mode__", "claude-code-main");
    for (const rel of ["run.mjs", "search.mjs", "SHA256SUMS"]) assert.ok(isFile(root, rel), "claude-code-main: " + rel);
    assert.ok(!existsSync(path.join(root, ".claude-plugin", "marketplace.json")), "no nested marketplace inside the plugin folder");
  });

  // Owner decision 2026-10-28 (final): Codex uses the context7 style too. codex-cli 0.156.1 reads a marketplace entry
  // {"source":"local","path":"./plugins/<dir>"} (bundled marketplace ~/.codex/.tmp/bundled-marketplaces/openai-bundled/.agents/plugins/marketplace.json;
  // `codex plugin list --json` prints source.source "local"). The entry points at the one built copy; no npm entry.
  test("[ADR-0023] native/codex-main: main tree .agents/plugins/marketplace.json points at the built plugin subfolder (local source, no npm)", () => {
    const mk = json(main, ".agents/plugins/marketplace.json");
    assert.equal(mk.name, "context-mode");
    assert.equal(mk.plugins.length, 1);
    const [entry] = mk.plugins;
    assert.equal(entry.name, "context-mode", "codex plugin add context-mode@context-mode");
    assert.deepEqual(entry.source, { source: "local", path: "./plugins/claude-code" });
    assert.ok(!JSON.stringify(mk).includes('"npm"'), "no npm entry");
    const root = path.join(main, "plugins", "claude-code");
    const m = json(root, ".codex-plugin/plugin.json");
    assert.equal(m.name, entry.name, "plugin.json name equals the marketplace entry name");
    assert.equal(m.version, VERSION);
    const mcp = json(root, stripRoot(m.mcpServers));
    assertServers(root, mcp.mcpServers, "codex-main");
    assert.ok(mcp.mcpServers["context-mode"].args.includes("codex"), "codex-main: server runs with --agent codex");
    assertHooks(root, stripRoot(m.hooks), "codex-main");
    assertSkills(root, m.skills, "mcp__context_mode__", "codex-main");
  });

  // MAIN-ONLY (docs/v2/release/MAIN-ONLY.md): Gemini and Qwen install the repo root of the tagged release commit.
  // Their root manifests point into the one built copy under plugins/claude-code (D-MO-1), so nothing is built twice.
  const BUILT = "plugins/claude-code/";
  test("[MAIN-ONLY] native/gemini-main: root gemini-extension.json and hooks/hooks.json name files shipped in plugins/claude-code", () => {
    const g = json(main, "gemini-extension.json");
    assert.equal(g.name, "context-mode");
    assert.equal(g.version, VERSION);
    assert.ok(!("contextFileName" in g), "gemini: no contextFileName (ADR-0023 D5)");
    assertServers(main, g.mcpServers, "gemini-main");
    assert.ok(g.mcpServers["context-mode"].args[0].includes(BUILT), "gemini-main: server path is inside " + BUILT);
    assert.ok(g.mcpServers["context-mode"].args.includes("gemini"), "gemini-main: server runs with --agent gemini");
    assertHooks(main, "hooks/hooks.json", "gemini-main");
    for (const c of hookCommands(json(main, "hooks/hooks.json"))) {
      assert.ok(c.includes(BUILT + "hook.mjs"), "gemini-main: hook path is inside " + BUILT + ": " + c);
      assert.ok(c.endsWith("--agent gemini"), "gemini-main: " + c);
    }
  });

  test("[MAIN-ONLY] native/qwen-main: root qwen-extension.json names shipped server and a root hooks file with --agent qwen", () => {
    const q = json(main, "qwen-extension.json");
    assert.equal(q.name, "context-mode");
    assert.equal(q.version, VERSION);
    assertServers(main, q.mcpServers, "qwen-main");
    assert.ok(q.mcpServers["context-mode"].args[0].includes(BUILT), "qwen-main: server path is inside " + BUILT);
    assert.ok(q.mcpServers["context-mode"].args.includes("qwen"), "qwen-main: server runs with --agent qwen");
    assertHooks(main, q.hooks, "qwen-main");
    for (const c of hookCommands(json(main, q.hooks))) {
      assert.ok(c.includes(BUILT + "hook.mjs"), "qwen-main: hook path is inside " + BUILT + ": " + c);
      assert.ok(c.endsWith("--agent qwen"), "qwen-main: " + c);
    }
  });

  test("[MAIN-ONLY] native/main: the main tree writes no release branch name and no instruction file", () => {
    for (const name of ["GEMINI.md", "QWEN.md", "CLAUDE.md", "AGENTS.md"]) assert.ok(!existsSync(path.join(main, name)), "no instruction file " + name);
    const mk = readFileSync(path.join(main, ".claude-plugin", "marketplace.json"), "utf8");
    assert.ok(!mk.includes("release-staging") && !mk.includes('"ref"'), "marketplace names no branch or ref");
  });
});

describe("ADR-0023 build: hook templates in docs", () => {
  // D-FU-RM-TEMPLATES-1: codex, vscode and copilot-cli have no documented plugin-root variable, so the shipped
  // hooks/<id>.json files are templates. The install docs one-line writer fills the path.

  const read = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");

  for (const id of ["codex", "vscode", "copilot-cli"]) {
    test(`install guide ${id} says the shipped hook file is a template`, () => {
      const md = read(`docs/install/${id}.md`);
      assert.ok(md.includes(`the writer fills the path; do not copy hooks/${id}.json by hand`), `${id}.md lacks the template note`);
    });
  }

  test("impl/10-adapters.md marks the codex, vscode and copilot-cli hook files as templates", () => {
    const md = read("docs/v2/impl/10-adapters.md");
    assert.match(md, /Template hook files[^\n]*codex[^\n]*vscode[^\n]*copilot-cli/);
  });

  test("claude-code guide states the native marketplace command (ADR-0023) and the claude mcp add limit; LAUNCH keeps ADR-0011 step b", () => {
    const guide = read("docs/install/claude-code.md");
    assert.match(guide, /claude plugin marketplace add mksglu\/context-mode/, "guide: no native marketplace command");
    assert.match(guide, /claude mcp add/, "guide: no claude mcp add limit");
    const launch = read("docs/v2/LAUNCH.md");
    assert.match(launch, /ADR-0011 step b/, "LAUNCH: no ADR-0011 step b");
    assert.match(launch, /claude mcp add/, "LAUNCH: no claude mcp add fallback");
  });
});

describe("ADR-0023 build: Gemini hook shell", () => {
  // GEM-WIN-5 (D-WIN-GEMINI-SHELL-1): how Gemini CLI turns hooks/hooks.json into a process on Windows.
  // Source read (gemini-cli 0.26.0 and 0.65.0): extension-manager loadExtensionHooks runs hydrateString over every string
  // with { extensionPath, workspacePath, "/": path.sep, pathSeparator: path.sep }, so ${extensionPath} and ${/} are
  // expanded in a hook command. hookRunner then spawns `powershell.exe -NoProfile -Command <command>` on Windows
  // (ComSpec is only read to pick pwsh/powershell), never cmd.exe. This test repeats that hydration (split/join, same
  // replace-only-known-keys rule) with fake Windows paths on every OS, and runs the real powershell.exe on Windows.


  const hydrate = (s, vars) => Object.entries(vars).reduce((acc, [k, v]) => acc.split("${" + k + "}").join(v), s);
  const geminiCommand = (dir) => {
    const hooks = JSON.parse(readFileSync(path.join(dir, "hooks", "hooks.json"), "utf8")).hooks;
    const cmds = Object.values(hooks).flatMap((groups) => groups.flatMap((g) => g.hooks.map((h) => h.command)));
    assert.ok(cmds.length > 0, "gemini hook file has commands");
    assert.equal(new Set(cmds).size, 1, "one command for every event");
    return cmds[0];
  };

  test("GEM-WIN-5: the gemini hook command, hydrated with Windows values, starts with node and quotes the spaced path", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cm-gem-shell-"));
    try {
      generateManifests(dir);
      const ext = "C:\\Users\\Jane Doe\\.gemini\\extensions\\context-mode";
      const line = hydrate(geminiCommand(dir), { extensionPath: ext, "/": "\\", pathSeparator: "\\" });
      assert.equal(line, 'node "' + ext + '\\hook.mjs" --agent gemini');
      assert.ok(!line.startsWith('"'), "a leading quoted string is a PowerShell parse error (D-HW-PS-1)");
      assert.ok(!line.includes("${"), "no placeholder left for the shell to see");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // Only a real Windows run proves the PowerShell parse of the spaced, backslash path.
  test("GEM-WIN-5: Windows PowerShell, the shell Gemini uses, runs the hydrated gemini hook command", { skip: process.platform !== "win32" }, () => {
    const root = mkdtempSync(path.join(tmpdir(), "cm gem ps "));
    try {
      const ext = path.join(root, "ext dir");
      mkdirSync(ext, { recursive: true });
      writeFileSync(path.join(ext, "hook.mjs"), "let d='';process.stdin.on('data',(c)=>d+=c).on('end',()=>process.stdout.write('ran:' + process.argv.slice(2).join(' ') + ':' + d));\n");
      const out = mkdtempSync(path.join(root, "out "));
      generateManifests(out);
      const line = hydrate(geminiCommand(out), { extensionPath: ext, "/": path.sep, pathSeparator: path.sep });
      // Same wrapper Gemini adds so a non-zero exit of the native command is kept.
      const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", line + "; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }"], { input: '{"x":1}', encoding: "utf8", windowsHide: true });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout.trim(), 'ran:--agent gemini:{"x":1}', "stdin reaches the native command through -Command");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("ADR-0023 build: Qwen hook shell", () => {
  // Q-WIN-5 (D-WIN-QWEN-SHELL-1): how Qwen Code turns hooks/qwen.json into a process on Windows.
  // Source read (qwen-code 0.26.2, chunk-2XNBZWKL): substituteHookVariables does a plain text swap of ${CLAUDE_PLUGIN_ROOT}
  // with the extension path (path.join, so backslashes on Windows); no slash conversion. getShellConfiguration picks
  // bash -c only when MSYSTEM/TERM says Git Bash, else ComSpec (cmd.exe /d /s /c, or PowerShell when ComSpec is one).
  // In bash a backslash inside double quotes is kept unless it comes before $ ` " \ or newline, so a drive path survives.
  // This test repeats the swap with fake Windows paths on every OS and runs real bash (Git Bash on Windows).


  const VAR = "${CLAUDE_PLUGIN_ROOT}";
  const hydrate = (s, root) => s.split(VAR).join(root);
  const qwenCommands = (dir) => {
    const hooks = JSON.parse(readFileSync(path.join(dir, "hooks", "qwen.json"), "utf8")).hooks;
    const cmds = Object.values(hooks).flatMap((groups) => groups.flatMap((g) => g.hooks.map((h) => h.command)));
    assert.ok(cmds.length > 0, "qwen hook file has commands");
    assert.equal(new Set(cmds).size, 1, "one command for every event");
    return cmds[0];
  };
  const gitBash = () => {
    if (process.platform !== "win32") return "bash";
    const roots = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], "C:\\Program Files"].filter(Boolean);
    return roots.map((r) => path.join(r, "Git", "bin", "bash.exe")).find((p) => existsSync(p));
  };

  test("Q-WIN-5: the qwen hook command, swapped with a Windows path, starts with node and quotes the spaced path", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cm-qwen-shell-"));
    try {
      generateManifests(dir);
      const raw = qwenCommands(dir);
      assert.equal(raw.split("${").length - 1, 1, "the only placeholder is the one qwen replaces in hook commands");
      const ext = "C:\\Users\\Jane Doe\\.qwen\\extensions\\context-mode";
      const line = hydrate(raw, ext);
      assert.equal(line, 'node "' + ext + '/hook.mjs" --agent qwen');
      assert.ok(!line.startsWith('"'), "a leading quoted string is a PowerShell parse error (D-HW-PS-1)");
      assert.ok(!line.includes("${"), "no placeholder left for the shell to see");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // bash (Git Bash on Windows) must hand node the path byte for byte: spaces, a dot dir, drive letter, backslashes.
  test("Q-WIN-5: bash -c keeps a backslashed, spaced Windows path inside the double quotes", { skip: gitBash() === undefined ? "no bash" : false }, () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cm-qwen-bash-"));
    try {
      generateManifests(dir);
      const ext = "C:\\Users\\Jane Doe\\.qwen\\extensions\\context-mode";
      const line = hydrate(qwenCommands(dir), ext);
      assert.ok(line.startsWith("node "));
      // Swap only the program: printf shows the one argument bash passes.
      const r = spawnSync(gitBash(), ["-c", "printf '%s' " + line.slice("node ".length).split(" --agent")[0]], { encoding: "utf8", windowsHide: true });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, ext + "/hook.mjs");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // Real files: the shell qwen picks must start node on the stub with stdin intact. A real run on Windows covers Git Bash.
  test("Q-WIN-5: bash -c starts node on a spaced extension dir and stdin reaches it", { skip: gitBash() === undefined ? "no bash" : false }, () => {
    const root = mkdtempSync(path.join(tmpdir(), "cm qwen run "));
    try {
      const ext = path.join(root, "ext dir");
      mkdirSync(ext, { recursive: true });
      writeFileSync(path.join(ext, "hook.mjs"), "let d='';process.stdin.on('data',(c)=>d+=c).on('end',()=>process.stdout.write('ran:' + process.argv.slice(2).join(' ') + ':' + d));\n");
      const out = mkdtempSync(path.join(root, "out "));
      generateManifests(out);
      const line = hydrate(qwenCommands(out), ext);
      const r = spawnSync(gitBash(), ["-c", line], { input: '{"x":1}', encoding: "utf8", windowsHide: true });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout.trim(), 'ran:--agent qwen:{"x":1}');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  // Windows only. Qwen's hookRunner (getShellConfiguration, no Git Bash env) runs spawn(ComSpec, ["/d","/s","/c", line],
  // { shell: false }) with NO windowsVerbatimArguments, so Node re-quotes the whole line and escapes the inner quotes.
  // This repeats that exact spawn on the real cmd.exe, with a spaced extension dir.
  test("Q-WIN-5: cmd.exe /d /s /c, spawned the way qwen spawns it, runs the hydrated qwen hook command", { skip: process.platform !== "win32", todo: "KNOWN DEFECT Q-WIN-5 (D-WIN-QWEN-SHELL-1): Node escapes the inner quotes as \\\" and node.exe gets literal quote characters; needs a design decision, see OPEN-ITEMS" }, () => {
    const root = mkdtempSync(path.join(tmpdir(), "cm qwen cmd "));
    try {
      const ext = path.join(root, "ext dir");
      mkdirSync(ext, { recursive: true });
      writeFileSync(path.join(ext, "hook.mjs"), "let d='';process.stdin.on('data',(c)=>d+=c).on('end',()=>process.stdout.write('ran:' + process.argv.slice(2).join(' ') + ':' + d));\n");
      const out = mkdtempSync(path.join(root, "out "));
      generateManifests(out);
      const line = hydrate(qwenCommands(out), ext);
      const r = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", line], { input: '{"x":1}', encoding: "utf8", shell: false, windowsHide: true });
      assert.equal(r.status, 0, "stderr=" + r.stderr + " stdout=" + r.stdout + " line=" + line);
      assert.equal(r.stdout.trim(), 'ran:--agent qwen:{"x":1}');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("ADR-0023 build: package hook shell", () => {
  // Q-WIN-4 (D-WIN-PKGHOOK-1): the hook command a package channel ships (claude-code, qwen, gemini) must not start with
  // a quoted string. Qwen Code runs a Windows hook under cmd by default and under PowerShell when the hook sets `shell`
  // (qwen-code docs/users/features/hooks.md); Gemini always uses PowerShell. PowerShell reads a leading quoted string as
  // an expression and fails to parse the rest. The shipped form is `node "<path>" --agent <id>`: valid in cmd, sh and
  // PowerShell. Fake Windows values run on every OS.


  const FILES = { "claude-code": "claude-code.json", qwen: "qwen.json", gemini: "hooks.json" };
  const hydrate = (s, vars) => Object.entries(vars).reduce((acc, [k, v]) => acc.split("${" + k + "}").join(v), s);
  const commands = (dir, file) => {
    const hooks = JSON.parse(readFileSync(path.join(dir, "hooks", file), "utf8")).hooks;
    return [...new Set(Object.values(hooks).flatMap((groups) => groups.flatMap((g) => g.hooks.map((h) => h.command))))];
  };

  test("Q-WIN-4: package hook commands start with bare node and quote the spaced path, hydrated with Windows values", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cm-pkg-shell-"));
    try {
      generateManifests(dir);
      const root = "C:\\Users\\Jane Doe\\.qwen\\extensions\\context-mode";
      for (const [id, file] of Object.entries(FILES)) {
        const cmds = commands(dir, file);
        assert.equal(cmds.length, 1, id + ": one command for every event");
        const line = hydrate(cmds[0], { CLAUDE_PLUGIN_ROOT: root, extensionPath: root, "/": "\\", pathSeparator: "\\" });
        assert.ok(line.startsWith("node "), id + ": first token is bare node: " + line);
        assert.ok(!line.includes("${"), id + ": no placeholder left for the shell to see");
        assert.ok(line.endsWith(" --agent " + id), id + ": " + line);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // CP-WIN-1 / VS-WIN-1 (D-WIN-FLATPKG-1): copilot-cli and vscode ship a flat shape (no nested hooks array). The shipped
  // command is bare `node hook.mjs --agent <id>`: no quoted first token, so PowerShell parses it with no `&`.
  test("CP-WIN-1, VS-WIN-1: shipped copilot-cli and vscode hook commands start with bare node (valid in PowerShell, cmd, sh)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cm-pkg-flat-"));
    try {
      generateManifests(dir);
      for (const id of ["copilot-cli", "vscode"]) {
        const hooks = JSON.parse(readFileSync(path.join(dir, "hooks", id + ".json"), "utf8")).hooks;
        const cmds = [...new Set(Object.values(hooks).flatMap((entries) => entries.map((h) => h.command)))];
        assert.equal(cmds.length, 1, id + ": one command for every event");
        assert.ok(cmds[0].startsWith("node "), id + ": first token is bare node: " + cmds[0]);
        assert.ok(!cmds[0].startsWith('"') && !cmds[0].includes("${"), id + ": no leading quote, no placeholder");
        assert.ok(cmds[0].endsWith(" --agent " + id), id + ": " + cmds[0]);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
});

// Serial: this section sets and clears process.env keys, which the other sections read when they spawn children.
describe("ADR-0023 build: npm package on Claude Code (scorer and child env)", () => {
  // Pure parts of the published-package live runner for Claude Code (e2e/live/npm-package/claude-code.mjs):
  // the 200 KB fixture with one FATAL line, the transcript scorer and the login isolation env. No model calls.

  const L = (o) => JSON.stringify(o);

  test("fixture: about 200 KB with exactly one FATAL line that holds the value", () => {
    const s = fatalLog();
    const bytes = Buffer.byteLength(s);
    assert.ok(bytes >= 190000 && bytes <= 230000, `log is ${bytes} bytes`);
    const fatal = s.split("\n").filter((l) => l.includes("FATAL"));
    assert.equal(fatal.length, 1);
    assert.ok(fatal[0].includes(FATAL_VALUE));
    assert.equal(PROMPT, "read logs/app.log with a shell cat and tell me the value on the FATAL line");
  });

  test("scoreArm: bytes from tool_result, answer from result, hook fired from PreToolUse/PostToolUse hook events", () => {
    const out = [
      L({ type: "system", subtype: "init", mcp_servers: [{ name: "plugin:context-mode:context-mode", status: "connected" }] }),
      L({ type: "system", subtype: "hook_response", hook_event: "SessionStart", stdout: "x" }),
      L({ type: "assistant", message: { id: "m1", content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "cat logs/app.log" } }] } }),
      L({ type: "system", subtype: "hook_response", hook_event: "PreToolUse", stdout: "{}" }),
      L({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "12345" }] } }),
      L({ type: "assistant", message: { id: "m2", content: [{ type: "tool_use", id: "t2", name: "mcp__plugin_context-mode_context-mode__ctx_search", input: {} }] } }),
      L({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t2", content: [{ type: "text", text: "abc" }] }] } }),
      L({ type: "result", result: `The value is ${FATAL_VALUE}.`, total_cost_usd: 0.02, is_error: false }),
    ].join("\n");
    const r = scoreArm(out);
    assert.equal(r.bytes, 8);
    assert.equal(r.answerOk, true);
    assert.equal(r.hookFired, true);
    assert.deepEqual(r.tools, ["Bash", "mcp__plugin_context-mode_context-mode__ctx_search"]);
    assert.equal(r.mcpConnected, true);
    assert.equal(r.costUsd, 0.02);
  });

  test("scoreArm: no tool hook event and a wrong answer score false", () => {
    const out = [
      L({ type: "system", subtype: "hook_response", hook_event: "SessionStart", stdout: "x" }),
      L({ type: "result", result: "I do not know.", total_cost_usd: 0, is_error: false }),
    ].join("\n");
    const r = scoreArm(out);
    assert.equal(r.hookFired, false);
    assert.equal(r.answerOk, false);
    assert.equal(r.bytes, 0);
    assert.equal(r.mcpConnected, false);
  });

  test("childEnv: own HOME, config dir under that HOME, no API key, no parent CLAUDE_* leak", () => {
    process.env.ANTHROPIC_API_KEY = "leak"; process.env.CLAUDE_CONFIG_DIR = "/leak";
    try {
      const e = childEnv("/sb/home", "/sb/bin:/x");
      assert.equal(e.HOME, "/sb/home");
      assert.equal(e.CLAUDE_CONFIG_DIR, path.join("/sb/home", ".claude"));
      assert.equal(e.PATH, "/sb/bin:/x");
      assert.equal(e.ANTHROPIC_API_KEY, undefined);
      assert.equal(e.ENABLE_CLAUDEAI_MCP_SERVERS, "false");
      assert.equal(e.CLAUDE_CODE_DISABLE_AUTO_MEMORY, "1");
      assert.equal(e.CLAUDE_CODE_DISABLE_CLAUDE_MDS, "1");
    } finally { delete process.env.ANTHROPIC_API_KEY; delete process.env.CLAUDE_CONFIG_DIR; }
  });
});
