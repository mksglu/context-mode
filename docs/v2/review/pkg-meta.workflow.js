export const meta = {
  name: 'v2-pkg-meta',
  description: 'v2-design package.json and plugin manifests still carry v1 metadata (version 1.0.169, engines >=22.5, v1 description, keywords, better-sqlite3 and other v1 deps). Make the source of truth match what v2 ships, test-first',
  phases: [{ title: 'Fix', detail: 'one fixer, test-first' }],
}

const SNH = { model: 'claude-sonnet-5-5', effort: 'high' }
const RESULT = { type: 'object', properties: {
  done: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } },
  numbers: { type: 'string' }, summary: { type: 'string' } }, required: ['done', 'commits', 'numbers', 'summary'] }

const prompt = `You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-pm; delete it before you return). Another agent edits README.md, docs/install/* and tests/v2/repo/install-docs-native.test.mjs right now: do not touch those files. Small commits, pull --rebase before every push, keep both sides on conflict; push after each finished file. Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com. Never touch main or the release branch, never force-push, never tag, never npm publish, never use a token.
Rules: tests first (red before green); never weaken an assertion; DEVIATIONS.md row per behaviour change; no regex as a mechanism. Unit tests need: npm install --no-package-lock, node build/build.mjs --generated-only. node --test tests/v2/ 0 fail before the last push; then watch ci.yml on your head and report each job.

Problem: on v2-design, package.json is still the v1 file: version 1.0.169, engines node >=22.5.0, description "MCP plugin that saves 98% of your context window. Works with Claude Code, Gemini CLI, VS Code Copilot, OpenCode, and Codex CLI...", keywords include openclaw and miss most v2 hosts, main ./build/adapters/opencode/plugin.js, dependencies @clack/prompts, @mixmark-io/domino, @modelcontextprotocol/sdk, better-sqlite3, picocolors, turndown, turndown-plugin-gfm, zod; devDependencies include vitest, @types/better-sqlite3. .claude-plugin/plugin.json, .claude-plugin/marketplace.json and .codex-plugin/plugin.json also say 1.0.169 and the v1 description. The release build writes a different package.json (2.0.0-next.8, engines >=24.15.0, no dependencies, bin cli.mjs, main ./opencode/plugin.js). Two sources of truth that disagree.
Do:
1. Find how build/build.mjs (and the release workflow) writes the release package.json and manifests, and where the version comes from. Make one source of truth: the release fields come from v2-design package.json (or one constants file), never hand-copied.
2. v2-design package.json matches v2: version = the last published next (2.0.0-next.8; the release workflow sets it from the tag, keep that path working); engines node >=24.15.0 (same constant as the runtime check); description short and accurate for v2 (local, free; name the 10 hosts or say "10 coding agents"; no number that is not measured in docs/benchmarks); keywords for the 10 supported hosts (claude-code, codex, gemini-cli, qwen-code, copilot-cli, vscode, opencode, pi, kiro, zcode) plus mcp, context-window, sandbox, fts5; drop openclaw and any unsupported host; main/bin/files/type/license as v2 ships them; homepage, repository, bugs correct.
3. Dependencies: for each dependency and devDependency prove use by v2 (src, build, tests/v2, e2e, scripts) with grep evidence; move build-time-only packages to devDependencies (bundled by esbuild), remove unused ones (v1-only like better-sqlite3 if no v2 code or test needs it; if a v1 test path or tooling still needs it, say where and keep it). The published package must stay dependency-free.
4. Plugin manifests (.claude-plugin/*, .codex-plugin/*, gemini/qwen extension json if present in the source tree): same version and description, generated or checked from the one source.
5. Red test first: a test that fails when the v2-design package.json or any manifest disagrees with the release build output on version, engines, description, bin, main; and when a listed dependency has no v2 use. Then green.
6. npm install --no-package-lock, full build, npm pack --dry-run: list the tarball files and confirm no runtime deps. Return done, commits, numbers (before/after deps, tarball file count), summary.`

let r = null
for (let i = 0; i < 3 && !r; i++) r = await agent(i ? prompt + '\n\nA previous attempt died on an API error. Continue from what is pushed.' : prompt, { label: i ? `pm-retry${i}` : 'pm', phase: 'Fix', schema: RESULT, ...SNH })
return r
