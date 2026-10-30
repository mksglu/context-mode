# Reply to Viet: rerun on 2.0.0-next.17

Version to test: 2.0.0-next.17 (npm dist-tag next, plugin marketplace release branch). Please use a fresh CODEX_HOME.

## What changed since next.15

1. Setup trust (your "4 of 4 plugin hooks untrusted" rollback). Codex 0.166 reports the hook hash as "<hook hash>/<plugin hash>" and trusts a hook only when trusted_hash is the hook hash alone. Setup now writes only that part. I reproduced your symptom on macOS with the alpha, and the fix makes all 4 hooks trusted. Fix: D-NI-CODEX-TRUST-2.
2. Native cat not denied on Windows. Codex 0.166 runs each hook through PowerShell on Windows. PowerShell reads a leading quoted path as a string, so our line failed before our code ran. That matches your replay result (the hook denies when you run it directly) and your empty observation hook. On Windows the codex hook line is now node "<hook.mjs>" --agent codex. Fix: D-C166-WIN-FIRE-2.

## What to rerun

1. Repeat your plugin route: codex plugin add context-mode@context-mode, then node <next.17 package>/cli.mjs setup --yes --agents codex --json. Expect status PASS, rolledBack false, no "untrusted" in hook-registered.
2. Look at the codex hook line in your CODEX_HOME hooks config. On Windows it must start with node, not with a quoted path.
3. Repeat the codex exec run with plain cat, cd .; cat, echo PRECHECK; cat and ls && cat of the 371243-byte log. Expect the context-mode denial with the ctx_execute redirect, not host truncation.
4. If a hook still does not fire, send the codex output tail and the hooks/list output (key, trustStatus, currentHash). Do not send credentials.

## Not proven

- Your exact Desktop-bundled 0.166.0-alpha.5.1 build on Windows. I proved macOS (0.156.1, 0.166.0, alpha.5, alpha.6) and a CI run on windows-latest with codex-cli 0.166.0.
- vscode and kiro have no live hook proof (see docs/v2/release/HOOKS-FIRE.md).
