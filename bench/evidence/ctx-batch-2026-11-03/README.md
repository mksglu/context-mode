# One ctx_batch call, live run of 2026-11-03

[ctx-batch-vite.json](ctx-batch-vite.json) holds one `ctx_batch` call and its reply, word for word. The call ran over MCP (stdio) against `server.mjs` of the `release` branch (Context Mode 2.0.0-next.34, commit `76e62e4`), with an empty HOME, in a clone of vitejs/vite at `b3cb057` (depth 300).

| | Bytes |
|---|---:|
| Output of the two commands (`wc -c`) | 318,426 |
| Reply of the call (the text the agent reads) | 11,688 |

The commands and queries are in [batch-input.json](batch-input.json). [batch-call.mjs](batch-call.mjs) makes the call:

```sh
git clone --depth 300 https://github.com/vitejs/vite vite
INPUT=batch-input.json CM_HOME="$(mktemp -d)" node batch-call.mjs <release>/server.mjs vite out.json
```

The vite history moves, so a rerun on a newer commit gives other lines.
