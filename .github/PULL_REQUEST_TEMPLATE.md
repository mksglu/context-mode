## What
`npm 1.0.2` crashes on Windows immediately on startup with `ERR_UNSUPPORTED_ESM_URL_SCHEME`. The published build contains `await import(join(pluginRoot, scriptPath))` which passes a raw `C:\...` path to the ESM loader. The `next` branch (v0.9.22) does not have this line and starts cleanly on Windows.

**This is a regression in the published `1.0.2`. The fix already exists in `next`. Recommend releasing `next` as `1.0.3`.**

## Why
On Windows, Node's ESM loader rejects absolute paths that aren't valid `file://` URLs. The published `build/cli.js` in `1.0.2` contains:

```js
// Line 55 of published 1.0.2 build/cli.js — NOT present in next branch:
await import(join(pluginRoot, scriptPath));
// → resolves to import("C:\\Users\\...") → ERR_UNSUPPORTED_ESM_URL_SCHEME
```

This line does not exist in the `next` branch source or its compiled output. The `next` branch uses only relative imports (`"./server.js"`, `"./executor.js"`) which are safe on all platforms.

## How
No code change needed — the fix is already in `next`. This PR is a request to publish `next` → `1.0.3`.

If a code-level fix is needed for the pattern in future, the safe approach is:

```js
import { pathToFileURL } from 'node:url';
await import(pathToFileURL(join(pluginRoot, scriptPath)).href);
```

## Affected platforms
- [ ] Claude Code
- [ ] Gemini CLI
- [x] VS Code Copilot
- [ ] OpenCode
- [ ] Codex CLI
- [ ] All platforms / core MCP server

## TDD (required)
> ⚠️ **Beta tester report — no code fix submitted.** Fix already exists in `next`.

### RED (failing test) — npm 1.0.2 on Windows
```
$ node ./node_modules/context-mode/build/cli.js

Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: Only URLs with a scheme in: file, data,
and node are supported by the default ESM loader. On Windows, absolute paths
must be valid file:// URLs. Received protocol 'c:'
  at node:internal/modules/esm/load:195
  code: 'ERR_UNSUPPORTED_ESM_URL_SCHEME'

Also reproduced with: npx context-mode
Both fail identically.
```

### GREEN (passing test) — next branch v0.9.22 on Windows
```
$ node ./build/cli.js

Context Mode MCP server v0.9.22 running on stdio
Detected runtimes:
  JavaScript: node (v24.12.0)
  Python:     python3 (Python 3.11.9)
  Shell:      C:\Program Files\Git\usr\bin\bash.exe
  Ruby:       ruby 3.3.7
  PHP:        php 7.3.7
  Perl:       perl v5.40.0
```

## Cross-platform verification
- [x] I've considered whether my change involves platform-specific behavior (file paths, stdin/stdout, child processes, shell commands, line endings)
- [x] I've asked an AI assistant (Claude) to review for cross-platform issues

## Adapter checklist
> ⚠️ Not applicable — regression report only, fix already in `next`.

- [ ] Hook scripts work on all affected platforms
- [ ] Routing instruction files updated
- [ ] Adapter tests pass
- [ ] `writeRoutingInstructions()` still works for all adapters

## Test plan
> ⚠️ Cannot run full suite on `1.0.2` — server fails before any tools load.
> `next` branch builds and starts cleanly — full test suite can run from there.

### Test output
```
Environment:
  OS:    Microsoft Windows NT 10.0.26200.0
  Node:  v24.12.0
  npm:   11.6.2
  Shell: PowerShell 7.5.0

npm 1.0.2:
  $ node ./node_modules/context-mode/build/cli.js
  → ERR_UNSUPPORTED_ESM_URL_SCHEME (immediate crash)

next branch v0.9.22 (built locally):
  $ npm install && npm run build && node ./build/cli.js
  → Context Mode MCP server v0.9.22 running on stdio ✅
```

### Before/After comparison
```
BEFORE (npm 1.0.2):    Server crashes immediately. No tools available.
AFTER  (next v0.9.22): Server starts, all runtimes detected, MCP ready.
```

### Workaround for Windows users until 1.0.3 is published
1. Clone the repo and check out `next`
2. Run `npm install && npm run build`
3. Point `.vscode/mcp.json` to the local build:

```json
{
  "servers": {
    "context-mode": {
      "command": "node",
      "args": ["C:/path/to/your/clone/context-mode/build/cli.js"]
    }
  }
}
```

## Local development setup
- [x] Cloned repo, checked out `next` branch
- [x] Ran `npm install && npm run build`
- [x] Pointed `mcp.json` to local `build/cli.js`
- [x] Confirmed v0.9.22 running via direct `node` invocation
- [ ] Symlinked plugin cache (not applicable — VS Code Copilot, not Claude Code)

## Checklist
- [x] I've checked existing PRs to make sure this isn't a duplicate
- [x] I'm targeting the `main` branch
- [ ] I've run the full test suite locally *(1.0.2 won't start; next branch can)*
- [ ] Tests came first (TDD: red then green) *(regression report only)*
- [x] No breaking changes to existing tool interfaces
- [x] CI passes on all 3 platforms *(next branch — Windows verified locally)*
