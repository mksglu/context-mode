## What

<!-- Brief description of the change -->

## Why

<!-- What problem does this solve? Link to issue if applicable: Fixes #000 -->

## How

<!-- Implementation approach. What did you change and why? -->

## TDD (required)

Every PR must include tests. We follow **red-green-refactor**:

1. **RED** — Write a failing test that describes the behavior you want. Paste the failure output below.
2. **GREEN** — Write the minimum code to make that test pass. Paste the passing output below.
3. **Refactor** — Clean up while keeping tests green.

### RED (failing test)

<!-- Paste the failing test output here. This proves your test actually catches the behavior. -->

```
```

### GREEN (passing test)

<!-- Paste the passing test output after your implementation. -->

```
```

## Cross-platform verification

Our CI runs on **Ubuntu, macOS, and Windows**. Before submitting:

- [ ] I've considered whether my change involves platform-specific behavior (file paths, stdin/stdout, child processes, shell commands, line endings)
- [ ] I've asked an AI assistant (Claude, etc.) to review my code for cross-platform issues — especially around `node:fs`, `node:child_process`, and `node:path`

<details>
<summary><strong>Common cross-platform pitfalls</strong></summary>

- **File paths:** Use `path.join()` / `path.resolve()`, never hardcode `/` separators
- **stdin reading:** Use event-based `on('data')/on('end')` — `readFileSync(0)` breaks on Windows, `for await (process.stdin)` hangs on macOS
- **Shell commands:** Windows uses `cmd.exe` by default, not `sh` — use `shell: true` carefully
- **Line endings:** Windows uses `\r\n` — normalize with `.replace(/\r\n/g, '\n')` when comparing output
- **Temp directories:** Use `os.tmpdir()`, never hardcode `/tmp`
- **Environment variables:** Case-sensitive on Unix, case-insensitive on Windows

</details>

## Test plan

- [ ] `npm run test:all` passes
- [ ] `npm run typecheck` passes
- [ ] `/context-mode:cm-doctor` — all checks PASS on my local build
- [ ] Tested in a live Claude Code session with my local MCP server

### Test output

<!-- Paste the output of `npm run test:all` here -->

```
```

### Before/After comparison

<!-- Show the output quality difference. Run the same prompt before and after your change. -->

## Local development setup

<!-- Confirm you followed the local dev workflow from CONTRIBUTING.md -->

- [ ] Pointed `installed_plugins.json` installPath to my local clone
- [ ] Updated `settings.json` hook path to my local clone
- [ ] Killed cached MCP server, verified local server is running
- [ ] Bumped version in `package.json` and confirmed with `/context-mode:cm-doctor`

## Checklist

- [ ] I've checked [existing PRs](https://github.com/mksglu/claude-context-mode/pulls) to make sure this isn't a duplicate
- [ ] I'm targeting the `main` branch
- [ ] I've run the full test suite locally
- [ ] Tests came first (TDD: red then green)
- [ ] No breaking changes to existing tool interfaces
- [ ] I've compared output quality before and after my change
- [ ] CI passes on all 3 platforms (Ubuntu, macOS, Windows)
