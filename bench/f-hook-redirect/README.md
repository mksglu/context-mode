# F. Hook redirect (flooding calls denied or replaced)

Each case here is a tool call that would put a large file, page or output into the chat.  
Without Context Mode the whole thing goes in. With Context Mode a hook steps in first.  
It sends the call to a context-mode tool, or it swaps the output for a short summary.

Run this group: `cd bench && node run.mjs f-hook-redirect`. All tables: [results/2026-11-01-darwin-arm64.md](../results/2026-11-01-darwin-arm64.md).

## f-read-large-file

**Read of a 46 KB log (denied, routed to ctx_execute)**

**What you do:** Open a 46 KB log file with Read.

**Without Context Mode:** Read puts the whole file into the chat: 46,216 B, about 11,554 tokens.

It starts like this:

```text
192.168.1.100 - - [23/Feb/2026:10:00:01 +0000] "GET /api/users HTTP/1.1" 200 892 209ms
10.0.0.55 - - [23/Feb/2026:10:00:03 +0000] "GET /api/users/42 HTTP/1.1" 200 1234 138ms
172.16.0.23 - - [23/Feb/2026:10:00:05 +0000] "GET /api/users/999 HTTP/1.1" 404 56 1ms
192.168.1.45 - - [23/Feb/2026:10:00:07 +0000] "POST /api/auth/login HTTP/1.1" 200 3456 452ms
10.0.1.12 - - [23/Feb/2026:10:00:09 +0000] "POST /api/auth/login HTTP/1.1" 401 123 92ms
192.168.2.78 - - [23/Feb/2026:10:00:11 +0000] "POST /api/auth/register HTTP/1.1" 201 1234 533ms
10.0.0.99 - - [23/Feb/2026:10:00:13 +0000] "POST /api/auth/register HTTP/1.1" 400 234 51ms
172.16.1.34 - - [23/Feb/2026:10:00:15 +0000] "POST /api/auth/logout HTTP/1.1" 200 7890 69ms
```

First 8 of 500 lines.

**With Context Mode:** The hook stops the call and tells the agent which context-mode tool to use. This is the whole reply. The agent gets 371 B, about 93 tokens. That keeps 99.2% of it out of the chat.

```text
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"context-mode: 46216-byte file, over the one-read limit. Run mcp__plugin_context-mode_context-mode__ctx_execute(language, code, file=\"/private/var/folders/df/nbmn_hp51n177rvbz8zh44sh0000gn/T/cm-bench-wSYFNy/project/data/access.log\") and print only the answer."}}
```

**Tool:** hook redirect (PreToolUse). [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=f-read-large-file)

**Rerun it yourself:**

```sh
cd bench && node run.mjs f-read-large-file
```

<sub>Proof: input [fixtures/data/access.log](../fixtures/data/access.log), 46,216 B, sha256 6e4fa9285b3435ff5f1bb28938124737a0e39035a2f535003b69c46f9e5ff085. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## f-read-big-source

**Read of a 61 KB source file (denied, routed to ctx_execute)**

**What you do:** Open a 61 KB source file with Read.

**Without Context Mode:** Read puts the whole file into the chat: 61,576 B, about 15,394 tokens.

It starts like this:

```text
// impl/01 §3, impl/00 §3.2, TECH-SPEC §11, DECISIONS-r9. Every constant lives here; no other module writes these literals.
import type { AgentId } from "./agents.js";

export const SERVER_KEY = "context-mode"; // TECH-SPEC §3.8 rule 3
export const TOOL_ORDER = Object.freeze(["ctx_execute","ctx_batch","ctx_index","ctx_search","ctx_resume","ctx_stats","ctx_doctor","ctx_upgrade","ctx_purge"] as  ...
/** D-HL-NAMES-1: a fixed hook text with each own tool name as the host calls it (prefix + name), by split/join. */
export function prefixToolNames(text: string, prefix: string): string {
  if (prefix === "") return text;
```

First 8 of 726 lines. Lines over 160 characters are cut.

**With Context Mode:** The hook stops the call and tells the agent which context-mode tool to use. This is the whole reply. The agent gets 374 B, about 94 tokens. That keeps 99.4% of it out of the chat.

```text
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"context-mode: 61576-byte file, over the one-read limit. Run mcp__plugin_context-mode_context-mode__ctx_execute(language, code, file=\"/private/var/folders/df/nbmn_hp51n177rvbz8zh44sh0000gn/T/cm-bench-o6o2Oo/project/data/source-big.ts\") and print only the answer."}}
```

**Tool:** hook redirect (PreToolUse). [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=f-read-big-source)

**Rerun it yourself:**

```sh
cd bench && node run.mjs f-read-big-source
```

<sub>Proof: input [fixtures/data/source-big.ts](../fixtures/data/source-big.ts), 61,576 B, sha256 7b4ba6812418434b9c682875de2454668ed98f3e0791f9e2b528ac034ec6e725. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## f-read-small-file

**Read of a small file (allowed: nothing to save)**

**What you do:** Open a small file with Read.

**Without Context Mode:** Read puts the whole file into the chat: 1,764 B, about 441 tokens.

It starts like this:

```text
# Fixture source

Copied byte for byte from github.com/mksglu/context-mode at commit
90af14e34bf35120c3310f7a75f54fa99d2cabba (origin/main):

- `tests/fixtures/*` (15 files) -> `bench/fixtures/data/`
- `skills/context-mode/SKILL.md` (as `skill-main.md`, GS5 allows no other SKILL.md) and `skills/context-mode/references/{anti-patterns,patterns-javascript,patte ...
```

First 8 of 24 lines. Lines over 160 characters are cut.

**With Context Mode:** The file is small, so the hook lets Read run as usual. The agent gets the file. The agent gets 1,764 B, about 441 tokens. Here the reply is a bit larger than the raw output: small outputs are cheap to read as they are.

```text
# Fixture source

Copied byte for byte from github.com/mksglu/context-mode at commit
90af14e34bf35120c3310f7a75f54fa99d2cabba (origin/main):

- `tests/fixtures/*` (15 files) -> `bench/fixtures/data/`
- `skills/context-mode/SKILL.md` (as `skill-main.md`, GS5 allows no other SKILL.md) and `skills/context-mode/references/{anti-patterns,patterns-javascript,patterns-python,patterns-shell}.md` -> `bench ...

The skill files are inputs to two v1 index+search scenarios (tests/live-benchmark.ts).
They are fixtures here, not v2 skills.

## Added for the bench suite (2026-10-31)
```

First 12 of 24 lines. Lines over 200 characters are cut.

**Tool:** hook redirect (PreToolUse). [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=f-read-small-file)

**Rerun it yourself:**

```sh
cd bench && node run.mjs f-read-small-file
```

<sub>Proof: input [fixtures/data/SOURCE.md](../fixtures/data/SOURCE.md), 1,764 B, sha256 393bd16d6603959c06d2bbc8e1f7c0a61b0d66a034874e69f2dd6e1e0858e8af. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## f-webfetch

**WebFetch of a docs page (denied, routed to ctx_index + ctx_search)**

**What you do:** Fetch the SQLite FTS5 docs page with WebFetch.

**Without Context Mode:** WebFetch puts the whole page into the chat: 215,354 B, about 53,839 tokens.

It starts like this:

```text
<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="content-type" content="text/html; charset=UTF-8">
<link href="sqlite.css" rel="stylesheet">
<title>SQLite FTS5 Extension</title>
<!-- path= -->
</head>
```

First 8 of 4,332 lines.

**With Context Mode:** The hook stops the call and tells the agent which context-mode tool to use. This is the whole reply. The agent gets 435 B, about 109 tokens. That keeps 99.8% of it out of the chat.

```text
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"context-mode: WebFetch sends its body into the conversation.\nRun it here instead; the full output is indexed and only the part that matches your intent comes back.\nTool: mcp__plugin_context-mode_context-mode__ctx_index, then mcp__plugin_context-mode_context-mode__ctx_search\n{\"url\":\"https://www.sqlite.org/fts5.html\"}"}}
```

**Tool:** hook redirect (PreToolUse). [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=f-webfetch)

**Rerun it yourself:**

```sh
cd bench && node run.mjs f-webfetch
```

<sub>Proof: input [fixtures/data/sqlite-fts5-docs.html](../fixtures/data/sqlite-fts5-docs.html), 215,354 B, sha256 de3092630358518a6869bf047055b3938e18b476e3fbc54f4e2146d1e593497f. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## f-bash-dump-post

**Bash dump of a 191 KB git log (PostToolUse replace)**

**What you do:** Print a 191 KB git log with Bash.

**Without Context Mode:** The whole command output goes into the chat: 191,120 B, about 47,780 tokens.

It starts like this:

```text
efe519b1 2026-10-31 ci: remove the temporary D5 proof workflow
3afc09ed 2026-10-31 ci: temporary D5 proof 3, hard stop of the load loop, 40x (removed after the run)
b49b870c 2026-10-31 ci: temporary D5 proof, print quiet-loop failures (removed after the run)
9c84763a 2026-10-31 ci: temporary D5 proof loop (removed after the run)
37a48049 2026-10-31 fix(doctor): D5 runs 3 to 9 hook/bare pairs, more only while over the bound (D-D5-MORE-PAIRS-1)
0fed73b1 2026-10-31 ci: temporary D5 probe 3, estimators from raw walls (removed after the run)
773f8b11 2026-10-31 ci: temporary D5 probe 2, pair count under load (removed after the run)
1691b4cc 2026-10-31 ci: temporary D5 probe workflow (removed after the run)
```

First 8 of 2,000 lines.

**With Context Mode:** The command runs, then the hook swaps its output for a short summary. The agent gets 204 B, about 51 tokens. That keeps 99.9% of it out of the chat.

```text
00ecd0d7 2026-10-14 review: docs/v2/review/TEST-TRIAGE-r2.md

mcp__plugin_context-mode_context-mode__ctx_search({queries:["cat data/git-log-large.txt"], source:"s1"}) searches the whole output (191120 B).
```

**Tool:** hook redirect (PostToolUse). [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=f-bash-dump-post)

**Rerun it yourself:**

```sh
cd bench && node run.mjs f-bash-dump-post
```

<sub>Proof: input [fixtures/data/git-log-large.txt](../fixtures/data/git-log-large.txt), 191,120 B, sha256 028317819bc1a93fcfbeeba2d5ffea829fe4c439e3889d688f76fbb11bb913ad. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## f-bash-curl-post

**Bash curl of a 219 KB API payload (allowed before, replaced after)**

**What you do:** Fetch a 219 KB GitHub API reply with curl in Bash.

**Without Context Mode:** The whole command output goes into the chat: 219,175 B, about 54,794 tokens.

It starts like this:

```text
[
  {
    "url": "https://api.github.com/repos/vercel/next.js/issues/101008",
    "repository_url": "https://api.github.com/repos/vercel/next.js",
    "labels_url": "https://api.github.com/repos/vercel/next.js/issues/101008/labels{/name}",
    "comments_url": "https://api.github.com/repos/vercel/next.js/issues/101008/comments",
    "events_url": "https://api.github.com/repos/vercel/next.js/issues/101008/events",
    "html_url": "https://github.com/vercel/next.js/pull/101008",
```

First 8 of 3,432 lines.

**With Context Mode:** The command runs, then the hook swaps its output for a short summary. The agent gets 291 B, about 73 tokens. That keeps 99.9% of it out of the chat.

```text
        "push",
        "status",

        "workflow_run"
      ]
    },

    "state_reason": null
  }
]
mcp__plugin_context-mode_context-mode__ctx_search({queries:["curl -s https://api.github.com/repos/vercel/next.js/issues?per_page=30"], source:"s1"}) searches the whole output (219175 B).
```

**Tool:** hook redirect (PostToolUse). [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=f-bash-curl-post)

**Rerun it yourself:**

```sh
cd bench && node run.mjs f-bash-curl-post
```

<sub>Proof: input [fixtures/data/github-api-issues-large.json](../fixtures/data/github-api-issues-large.json), 219,175 B, sha256 bd2bdb943de007b7bb57d4e4a53a01ad801cf57606a3228682b39d05eb8a5e16. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## f-read-vite-config

**Read of the 89 KB vite config source (denied, routed to ctx_execute)**

**What you do:** Open the 89 KB vite config source with Read.

**Without Context Mode:** Read puts the whole file into the chat: 91,362 B, about 22,841 tokens.

It starts like this:

```text
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import { inspect, isDeepStrictEqual, promisify } from 'node:util'
```

First 8 of 2,930 lines.

**With Context Mode:** The hook stops the call and tells the agent which context-mode tool to use. This is the whole reply. The agent gets 375 B, about 94 tokens. That keeps 99.6% of it out of the chat.

```text
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"context-mode: 91362-byte file, over the one-read limit. Run mcp__plugin_context-mode_context-mode__ctx_execute(language, code, file=\"/private/var/folders/df/nbmn_hp51n177rvbz8zh44sh0000gn/T/cm-bench-3dp66j/project/data/vite-config.ts\") and print only the answer."}}
```

**Tool:** hook redirect (PreToolUse). [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=f-read-vite-config)

**Rerun it yourself:**

```sh
cd bench && node run.mjs f-read-vite-config
```

<sub>Proof: input [fixtures/data/vite-config.ts](../fixtures/data/vite-config.ts), 91,362 B, sha256 65a62e65875835fbdd66ae3b0b1de9638dc1c046f9688422922a239ca72dce84. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## f-webfetch-vite-docs

**WebFetch of the 265 KB Vite features guide (denied, routed to ctx_index + ctx_search)**

**What you do:** Fetch the 265 KB Vite features guide with WebFetch.

**Without Context Mode:** WebFetch puts the whole page into the chat: 271,731 B, about 67,933 tokens.

It starts like this:

```text
<!DOCTYPE html>
<html lang="en-US" dir="ltr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Features | Vite</title>
    <meta name="description" content="Next Generation Frontend Tooling">
    <meta name="generator" content="VitePress v2.0.0-alpha.20">
```

First 8 of 224 lines.

**With Context Mode:** The hook stops the call and tells the agent which context-mode tool to use. This is the whole reply. The agent gets 439 B, about 110 tokens. That keeps 99.8% of it out of the chat.

```text
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"context-mode: WebFetch sends its body into the conversation.\nRun it here instead; the full output is indexed and only the part that matches your intent comes back.\nTool: mcp__plugin_context-mode_context-mode__ctx_index, then mcp__plugin_context-mode_context-mode__ctx_search\n{\"url\":\"https://vite.dev/guide/features.html\"}"}}
```

**Tool:** hook redirect (PreToolUse). [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=f-webfetch-vite-docs)

**Rerun it yourself:**

```sh
cd bench && node run.mjs f-webfetch-vite-docs
```

<sub>Proof: input [fixtures/data/vite-docs-features.html](../fixtures/data/vite-docs-features.html), 271,731 B, sha256 1dca10c0a7b348c1b9ddb46733cfde706f46bee0554175716a415fe8609187c8. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>
