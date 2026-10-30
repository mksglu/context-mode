#!/usr/bin/env node
// Review tool (not a test). Holds the area map (area -> ADR/PRD -> target file -> source files),
// checks every existing test file is in exactly one group, writes groups.json.
// Usage: node make-groups.mjs <perfile.files.json> <out groups.json> [more *.files.json ...]
// Source syntax: "dir/name" = tests/v2/dir/name.test.mjs ; "dir/*" = all of a dir ; "@path" = path.test.mjs from the repo root ; "%path" = path.e2e.mjs from the repo root.
import fs from "node:fs";
const T = "tests/v2/";
// [id, adr/prd, covers, [sources: "dir/*" or "dir/name" (no .test.mjs), relative to tests/v2/]]
const G = [
  ["e2e-gp1", "TECH-SPEC GP1, ADR-0019, ADR-0023", "GP1 install: node path, docs, install, uninstall, release tree, OpenCode client info (merge 6 GP1 files into one)", ["%e2e/cases/GP1-absolute-node-path", "%e2e/cases/GP1-install-docs", "%e2e/cases/GP1-install", "%e2e/cases/GP1-opencode-clientinfo", "%e2e/cases/GP1-release-tree", "%e2e/cases/GP1-uninstall"], "e2e/cases/GP1-install.e2e.mjs"],
  ["e2e-gp3", "TECH-SPEC GP3, ADR-0008", "GP3 hooks: perf, enforcement, Z Code tool names (merge 3 GP3 files into one)", ["%e2e/cases/GP3-hook-perf", "%e2e/cases/GP3-hooks", "%e2e/cases/GP3-zcode-names"], "e2e/cases/GP3-hooks.e2e.mjs"],
  ["e2e-gp11", "TECH-SPEC GP11, ADR-0010, ADR-0011", "GP11 doctor, upgrade, release audit, Pi and Antigravity (merge 3 GP11 files into one)", ["%e2e/cases/GP11-doctor-upgrade", "%e2e/cases/GP11-pi-agy", "%e2e/cases/GP11-release-audit"], "e2e/cases/GP11-doctor-upgrade.e2e.mjs"],
  ["e2e-gp-keep", "TECH-SPEC GP2, GP4-GP10, GP-SEARCH, GP-SETUP", "one file per GP case already; stay in place", ["%e2e/cases/GP-SEARCH-heldout", "%e2e/cases/GP-SETUP-npm-install", "%e2e/cases/GP2-prompt-surface", "%e2e/cases/GP4-execute", "%e2e/cases/GP5-index-search", "%e2e/cases/GP6-journal-resume", "%e2e/cases/GP7-scope", "%e2e/cases/GP8-concurrency", "%e2e/cases/GP9-lifecycle", "%e2e/cases/GP10-stats"], "keep"],
  ["0003-e2e-harness", "ADR-0003", "tests of the e2e harness itself (stay in place under e2e/, never import src/)", ["@e2e/harness/normalize", "@e2e/harness/run-filter"], "keep"],
  ["0012-live-eval-selftests", "ADR-0012", "scorers and analyzers of the live evals (stay in place; compact-hard is frozen)", ["@e2e/live/cache/analyze", "@e2e/live/compact-hard/score", "@e2e/live/routing/score"], "keep"],
  ["0012-live-harness", "ADR-0012", "keyless live harness, process groups, compact eval arms, M2 bench runner", ["e2e/live-proc-group", "e2e/live-runner-group", "e2e/windows-grandchild-kill", "e2e/compact-arms", "e2e/compact-fixtures", "e2e/compact-score", "e2e/compact-session", "bench/fixtures-run", "bench/m2-score"]],
  ["0017-v1-retention", "ADR-0017", "v1 vs v2 diff and the ported v1 executor and store tests", ["compat/v1-v2-diff", "tools/v1-executor-ported", "tools/v1-store-ported", "sandbox/win-build-ported"]],
  ["0018-contracts", "ADR-0018", "module contracts and single-source hook file", ["contracts/*"]],
  ["0018-build", "ADR-0018, ADR-0019, ADR-0023", "build, generated files, host manifests, npm package", ["build/*", "e2e/npm-package-claude-code"]],
  ["0002-store", "ADR-0002, PRD-v2 section 4, GP8, GP9", "single DB, schema, cleanup, checkpoint, owners, lifecycle exit", ["store/cleanup", "store/close-checkpoint", "store/config-dir", "store/cost-dedup", "store/db-platform-ported", "store/db", "store/owners", "store/reserve", "store/schema", "store/sha256", "store/shared-helpers", "lifecycle/exit"]],
  ["0007-identity", "ADR-0007, PRD-v2 section 5, GP7", "project and session identity, scope, containment, per-host home dirs", ["project/*", "store/contain", "store/resolve", "ops/project-dir-ported"]],
  ["0007-mcp-server", "ADR-0004, ADR-0005, ADR-0007, PRD-v2 sections 6-7", "MCP server, tool registry, call shapes, prompt delivery", ["server/*", "tools/call-shape"]],
  ["prd8-index-search", "PRD-v2 section 8, GP5", "chunking, index, FTS search, fetch, snippets", ["index/*", "store/fts", "store/snippet", "store/words", "store/no-regex-search-paths", "tools/index", "tools/index-ported", "tools/search", "tools/no-lossy-cut", "e2e/fetch-index-search-parity", "sandbox/fetch"]],
  ["prd9-sandbox", "PRD-v2 section 9, GP4", "execute, batch, runtimes, env, cap, kill, spawn", ["sandbox/cap", "sandbox/env", "sandbox/git-bash", "sandbox/kill", "sandbox/runtimes", "sandbox/spawn", "tools/execute", "tools/batch"]],
  ["prd12-stats-purge", "PRD-v2 sections 8 and 12, GP10", "stats and purge tools", ["tools/stats", "tools/purge"]],
  ["0008-enforcement", "ADR-0001, ADR-0008, PRD-v2 section 10, GP3", "policy: lexer, parse, decide, deny rules, unwrap, external MCP", ["policy/decide", "policy/external-mcp-ported", "policy/lexer", "policy/parse", "policy/read-deny", "policy/security-ported", "policy/unwrap", "policy/user-deny", "hooks/routing-ported"]],
  ["0016-subagent", "ADR-0016", "subagent context protection, run wrapper, VS Code tools", ["policy/subagent", "tools/run-wrapper", "hooks/vscode-project", "hooks/vscode-tools"]],
  ["prd10-hooks-runtime", "PRD-v2 section 10, GP3, GP6, GP7", "hook process: stdin, entry, dispatch, saving, errors, throttle", ["hooks/dispatch", "hooks/dispatch-compact", "hooks/decision", "hooks/decode-lenient-golden", "hooks/detached", "hooks/entry-ported", "hooks/gemini-live-order", "hooks/hook-entry", "hooks/hook-last-error", "hooks/hook-module-load", "hooks/hook-never-errors", "hooks/hook-old-node", "hooks/kiro-shell", "hooks/pretooluse-no-store-work", "hooks/replace-live-golden", "hooks/saving-effect", "hooks/saving-live-shapes", "hooks/stdin-read", "hooks/throttle", "hooks/tool-names", "hooks/usage"]],
  ["prd10-hook-fuzz", "PRD-v2 section 10", "seeded hook fuzz on every host (the long pole; one file on purpose)", ["hooks/hook-fuzz"]],
  ["0009-compaction-memory", "ADR-0009, PRD-v2 section 11, GP6", "compaction, journal, resume, recall, search decision", ["compaction/*", "store/journal", "store/journal-ported", "plugins/inprocess-journal", "tools/resume", "tools/search-decision"]],
  ["0020-adapters", "ADR-0020, PRD-v2 section 3", "agent adapters and the host table", ["adapters/*"]],
  ["0020-plugins", "ADR-0020, PRD-v2 section 3", "OpenCode and Pi in-process plugins", ["plugins/opencode", "plugins/opencode-ported", "plugins/pi", "plugins/pi-ported", "plugins/pi-ops-ported", "plugins/pi-search-whole-line"]],
  ["0020-hooks-all", "ADR-0020", "hooks and skills on every agent: one fire matrix", ["setup/hooks-all", "setup/hook-sample-copilot", "setup/hook-shell-windows", "setup/kiro-hook-shell", "setup/zcode-hook-shell"]],
  ["0020-gates-zcode", "ADR-0020", "hook gate and shape for Z Code", ["setup/zcode-gate", "setup/zcode-shape"]],
  ["0020-gates-vscode-gemini-kiro", "ADR-0020", "hook gates for VS Code, Gemini CLI, Kiro", ["setup/vscode-gate", "setup/gemini-gate", "setup/kiro-gate"]],
  ["0020-gates-pi-copilot-claude", "ADR-0020", "hook gates for Pi, Copilot CLI, Claude Code, Codex, OpenCode", ["setup/pi-gate", "setup/copilot-hooks-enabled", "setup/claude-code-hooks-run", "setup/codex-trust-key", "setup/opencode-plugin-gate", "setup/opencode-plugin-entry", "setup/hook-path-change"]],
  ["0020-fire", "ADR-0020", "real-agent fire tests (built bundle, skipped when the agent is absent)", ["e2e/claude-code-fire", "e2e/codex-cat-redirect", "e2e/copilot-cli-fire", "e2e/gemini-fire", "e2e/kiro-fire", "e2e/opencode-fire", "e2e/pi-fire", "e2e/qwen-fire", "e2e/vscode-fire", "e2e/zcode-fire"]],
  ["0019-setup-engine", "ADR-0019, ADR-0023, PRD-setup", "interactive setup engine and its no-regex rule", ["setup/engine", "setup/no-regex-setup", "setup/jsonc-host-files"]],
  ["0019-host-config", "ADR-0019, ADR-0023, PRD-setup", "host config read/write, TOML, plugin root and swap, uninstall", ["ops/atomic-file", "ops/host-config-toml", "ops/host-config", "ops/host-text", "ops/host-write", "ops/plugin-root", "ops/plugin-swap", "ops/uninstall"]],
  ["0019-cli", "ADR-0019, PRD-setup", "the context-mode CLI", ["cli/cli", "cli/cli-entry"]],
  ["0010-doctor-upgrade", "ADR-0010, PRD-v2 section 13, GP11", "doctor, upgrade, release fetch, checksums, report", ["ops/doctor-config", "ops/doctor-db", "ops/doctor-env", "ops/doctor-hook", "ops/db-heal", "ops/release-fetch", "ops/report", "ops/verify-sums", "tools/doctor", "tools/upgrade", "setup/doctor-hook-runs", "setup/doctor-roundtrip"]],
  ["0011-v1-transition", "ADR-0011, GP11", "v1 detect and remove, v1 migration, merge traffic", ["ops/detect-v1", "ops/detect-v1-kiro", "ops/v1-remove", "e2e/v1-migration-setup", "release/merge-traffic"]],
  ["0013-release-main", "ADR-0013, PRD-v2 section 14", "release to main: publish, plan-main, commit, branch protection", ["release/publish", "release/plan-main", "release/commit-main", "release/branch-protection", "release/release-next"]],
  ["0013-release-plan", "ADR-0013, ADR-0019, PRD-v2 section 14", "release plan, smoke, rollback, npm publish", ["release/smoke", "release/plan", "release/rollback", "release/publish-npm"]],
  ["0014-repo-hygiene", "ADR-0013, ADR-0014, ADR-0015", "issue forms, workflows, README, secrets, removed files", ["repo/check-removed", "repo/check-secrets", "repo/child-windows-hide", "repo/ci-install", "repo/command-skills", "repo/docs-facts", "repo/issue-forms", "repo/live-run-paths", "repo/no-truncate", "repo/readme-agents", "repo/release-main-workflow", "repo/release-skill", "repo/workflows"]],
  ["0023-install-docs", "ADR-0023, PRD-setup", "install docs per agent use the native install command", ["repo/install-docs", "repo/install-docs-native", "repo/install-docs-pi-gemini", "repo/install-docs-qwen-kiro", "repo/install-docs-simple", "repo/install-docs-source", "repo/install-docs-v1out", "repo/install-docs-vscode-hooks"]],
  ["0021-cache-safety", "ADR-0021", "prompt cache safety, prefix determinism, cache usage", ["cache/*", "bench/cache-mine", "plugins/opencode-cache", "plugins/pi-cache"]],
];
const files = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const live = process.argv.slice(4).flatMap((p) => JSON.parse(fs.readFileSync(p, "utf8")));
const info = new Map([...files, ...live].map((x) => [x.f, x]));
const all = files.map((x) => x.f);
const claimed = new Map();
function expand(src) {
  if (src.startsWith("@")) return [src.slice(1) + ".test.mjs"];
  if (src.startsWith("%")) return [src.slice(1) + ".e2e.mjs"];
  if (src.endsWith("/*")) return all.filter((f) => f.startsWith(T + src.slice(0, -1)) && f.endsWith(".test.mjs"));
  return [T + src + ".test.mjs"];
}
const groups = [];
for (const [id, adr, covers, srcs, mode] of G) {
  const keep = mode === "keep";
  const sources = srcs.flatMap(expand);
  for (const s of sources) {
    if (!info.has(s)) { console.error("UNKNOWN source", s, "in", id); process.exitCode = 1; }
    if (claimed.has(s)) { console.error("DUP", s, claimed.get(s), id); process.exitCode = 1; }
    claimed.set(s, id);
  }
  const targets = keep ? sources : [mode && mode !== "keep" ? mode : T + id + ".test.mjs"];
  const ms = sources.reduce((a, s) => a + (info.get(s)?.ms ?? 0), 0);
  const n = sources.reduce((a, s) => a + (info.get(s)?.pass ?? 0) + (info.get(s)?.skip ?? 0), 0);
  const loc = sources.reduce((a, s) => a + fs.readFileSync(s, "utf8").split("\n").length, 0);
  groups.push({ id, adr, covers, targets, sources, ms, tests: n, loc, keep });
}
const missing = all.filter((f) => !claimed.has(f));
if (missing.length) { console.error("UNCLAIMED", missing); process.exitCode = 1; }
fs.writeFileSync(process.argv[3], JSON.stringify(groups, null, 1) + "\n");
console.log(groups.length, "groups,", claimed.size, "of", all.length, "files claimed");
for (const g of groups) console.log(g.id.padEnd(34), String((g.ms / 1000).toFixed(1)).padStart(6) + "s", String(g.tests).padStart(5), "tests", String(g.sources.length).padStart(3), "files");
