# Reply: context-mode on OpenCode 2

Thank you for the report. It is fixed in 2.0.0-next.20.

## Cause

OpenCode 2 loads a plugin in a new way. It calls `setup(ctx)` with `ctx.location`, `ctx.tool`, `ctx.session` and `ctx.event`, and it reads the package through `exports["./server"]`. It also refuses a plugin file path. Our plugin used the OpenCode 1.19 shape, so the load failed (`Plugin must export a default definition with an id and an effect or setup function`, then `app.tool is not a function`).

## Fix

v1 is frozen, so the fix is in v2 only. The v2 plugin now has a `setup(ctx)` entry for OpenCode 2 and keeps the 1.19 entry for 1.19 and KiloCode. Setup writes the package directory to the `plugin` list. I tested it on the real @opencode/cli 2.2.5 loader: the plugin loads with no warning, the `ctx_*` tools show, and a large `cat` is denied with the `ctx_execute` redirect.

## Install on OpenCode 2

Use the OpenCode native command:

```sh
opencode plugin context-mode@next --global
```

Update an old install:

```sh
opencode plugin context-mode@next --global --force
```

`next` is 2.0.0-next.20 or newer. `latest` stays on the old release.

## What to rerun

1. Restart OpenCode.
2. `context-mode doctor --agents opencode`
3. `opencode mcp list --standalone`. `context-mode` must show as connected.
4. Run `/ctx-doctor` in OpenCode.

If one step fails, send the output of step 2 and the OpenCode log line that names the plugin.

## README claim

You wrote that the README says context-mode has zero tools. The v2 docs do not say this. The v2 README lists the `ctx_*` tools. If you read it in the v1 README, v1 is frozen and will not change.
