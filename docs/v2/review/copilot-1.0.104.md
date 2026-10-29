# Copilot CLI 1.0.104: "Denied by preToolUse hook from context-mode (hook errored)"

Reply to the tester. Measured on macOS with Copilot CLI 1.0.104 and context-mode 2.0.0-next.11.

## What was wrong

Copilot CLI counts a hook as "errored" when the hook command exits non-zero (the runtime string is "Hook command failed with code").
Then it denies the tool. This also blocks the context-mode tools you need to diagnose it.

I could not make the next.11 hook fail on Node 24 with the 1.0.104 payloads (bash, skill with string toolArgs, no hookEventName): all exit 0.
The hook did fail, with exit 1, in these cases:

1. Node below 22.3 on PATH (measured on 16.20.2, 18.18.2, 21.2.0). The hook calls `process.getBuiltinModule` at load.
   It throws `TypeError: process.getBuiltinModule is not a function` before any of our code can answer. Every tool is denied.
   Fixed: D-HNE-OLDNODE-1 (a small shim in every bundle). The hook now exits 0 on all of them.
2. Node 22 (supported by Copilot CLI): `cli.mjs` and `server.mjs` use `import.meta.main`, which is undefined before Node 24.2.
   `context-mode --version`, `setup`, `doctor` and the MCP server exited 0 and printed nothing.
   Fixed: D-HNE-CLI-ENTRY-1 (`src/entries/is-entry.ts`).
   Note: on Node 22 there is no `node:sqlite`, so the MCP server answers in degraded mode (only ctx_doctor). Install Node 24.15 or later.

Two more ways to get "hook errored" that I measured but did not change here:

3. The hook command holds the absolute node path from the day you ran setup. If that path is gone (for example a Homebrew Cellar
   upgrade), the shell exits 127 and the host reports "hook errored". Fix: run `context-mode setup` again.
4. A v1 hook file left in `~/.copilot/hooks/` runs `context-mode hook copilot-cli pretooluse`. If `context-mode` is not on the PATH of Copilot CLI,
   it exits 127. Fix: remove the v1 file, run `context-mode setup`.

Not the cause (all exit 0): a project path with spaces, a read-only project directory, a read-only store directory, a git-cold directory.

## What to run

```
node --version                 # needs 24.15 or later
npm i -g context-mode@next     # then:
context-mode setup --agents copilot-cli
context-mode doctor
```

If a tool is still denied, run the hook by hand with the command in `~/.copilot/hooks/context-mode.json`:

```
echo '{"hookEventName":"preToolUse","sessionId":"s","cwd":"/tmp","toolName":"bash","toolArgs":"{\"command\":\"ls\"}"}' | <that command>; echo $?
```

Exit must be 0. Send the exit code and stderr in the issue.

## Which version fixes it

Items 1 and 2: the next release after 2.0.0-next.11 that contains commits 257a5190, 80fabdb4 and 7b0df434 on v2-design.
The wider rule "a hook never errors, it decides" (own tools allowed, flooding tools denied with a redirect) is the guard agent's work on the same branch.

## Limits

I read the Copilot bundle for the hook rules, but the hook runner lives in its native runtime. The "errored" rule above comes from runtime strings and from runs of the real hook command, not from the source.
