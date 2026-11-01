# Reply to the tester on candidate baaa3149, 2026-11-01

Thank you for the careful, isolated repro. Each report had exact numbers and a clean setup, so we could reproduce all three in a test before we changed any code. All three are fixed in `2.0.0-next.25` (npm tag `next`, built from `58d6b744`).

## 1. Stats: returned bytes

Report: "421 B shown, 163,751 B counted as returned."

Cause: the journal row was written before the hook decided what the model gets. The row always said `returned_bytes` = the full output, so `ctx_stats` showed Saved 0 B. A second gap sat in the subagent path on Codex, Qwen and Zcode: those hosts cannot take a replace, but the row still counted one.

Fix:
- `ec5c3739`: the row is written after the decision. `returned_bytes` is the size of the text the model got.
- `e18a93c3`: a host without a replace channel journals the whole output as returned, in the subagent path too. The row is also written after the encode step, so a failed encode journals the whole output.
- Rows already written keep their values. Nothing is rewritten or deleted.

Rerun on the new version:

```sh
claude plugin update context-mode@context-mode
```

Restart the host, run the same Bash command that printed 163,751 B (`git diff --no-index`), then call `ctx_stats`. Expected: Returned is near the 421 B the model saw, and Saved is the difference. Sessions recorded before the update keep their old numbers.

## 2. D5 under a custom CODEX_HOME

Report: "D5 says PASS with 4 untrusted hooks; a large read still executes."

Cause: Codex started the MCP server with `HOME` and `CODEX_HOME` unset. `codex app-server` then answered `hooks/list` for the OS profile home, listed none of our hooks, and D5 took that as fine. Codex itself listed 4 of 4 hooks as untrusted in the home where the plugin sits.

Fix (`9e08df05`): one resolver picks the Codex home the running plugin belongs to: `CODEX_HOME` when set, else the home whose `plugins/cache` holds the running bundle, else `<home>/.codex`. D3, D4, D5 and the `codex app-server` call all use it. On the native plugin, D5 PASSes only when `hooks/list` from that home shows all our hooks trusted. A silent answer, a different home or no listed hook of ours is a FAIL with the fix `context-mode setup --agents codex`.

Rerun on the new version, with your custom `CODEX_HOME` set as in your repro:

```sh
codex plugin marketplace upgrade context-mode
context-mode doctor --agents codex
```

Expected: D5 FAIL with `context-mode setup --agents codex` while the hooks are untrusted. Then:

```sh
context-mode setup --agents codex
context-mode doctor --agents codex
```

Restart Codex and call `ctx_doctor`. Expected: D5 PASS, and a `cat` of a large log returns the `ctx_execute` redirect.

## 3. D3 with mixed user and project installs

Report: a disabled user-scope install next to an enabled project-scope directory marketplace gave `wrong: MCP entry, hook entries`.

Cause: D3 read only `installPath` from `installed_plugins.json`. It ignored `scope`, `projectPath` and `enabledPlugins`, so it could not name the install this project uses.

Fix (`b353268f`): D3 finds the marketplace root in this order: `CLAUDE_PLUGIN_ROOT` when it is the running bundle, then the recorded install that is the running bundle, then the only live record, then the enabled entry that applies to this project (local before project before user). When it cannot pick one, D3 names both directories and the native fix `claude plugin uninstall <key> --scope <scope>`.

Rerun on the new version, with the same mixed installs:

```sh
claude plugin update context-mode@context-mode
```

Restart Claude Code and call `ctx_doctor`. Expected: D3 PASS for the install the project uses. If D3 FAILs, it lists the extra install and prints the uninstall command to run.

## If a check FAILs

The doctor prints a `gh issue create` command and writes a report file under `~/.context-mode/reports/`. Please attach that file.

Thank you again for the careful repro.
