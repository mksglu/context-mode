# G. Overhead (hook latency, search latency, index time, full session)

Each case here shows what Context Mode costs: the time a hook adds to each tool call, search time and index time.  
The hook cases compare a hook process with a bare Node start, for each of the 10 agents.  
The last case adds up a full debugging session: what went into the chat and what stayed out.

Run this group: `cd bench && node run.mjs g-overhead`. All tables: [results/2026-11-01-darwin-arm64.md](../results/2026-11-01-darwin-arm64.md).

## g-hook-claude-code

**Hook latency, claude-code adapter (PostToolUse, small payload)**

**What you do:** Run any tool call in Claude Code. Its hook runs each time.

**Without Context Mode:** a bare Node start takes 32.0 ms.

**With Context Mode:** the Claude Code hook takes 43.8 ms, so it adds about 12.3 ms to each tool call. Each number is the median of 5 hook runs.

**Tool:** hook (PostToolUse). [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=g-hook-claude-code)

**Rerun it yourself:**

```sh
cd bench && node run.mjs g-hook-claude-code
```

<sub>Proof: input: small payloads built in the scenario. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## g-hook-codex

**Hook latency, codex adapter (PreToolUse, small payload)**

**What you do:** Run any tool call in Codex. Its hook runs each time.

**Without Context Mode:** a bare Node start takes 32.5 ms.

**With Context Mode:** the Codex hook takes 41.6 ms, so it adds about 8.1 ms to each tool call. Each number is the median of 5 hook runs.

**Tool:** hook (PreToolUse). [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=g-hook-codex)

**Rerun it yourself:**

```sh
cd bench && node run.mjs g-hook-codex
```

<sub>Proof: input: small payloads built in the scenario. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## g-hook-gemini

**Hook latency, gemini adapter (AfterTool, small payload)**

**What you do:** Run any tool call in Gemini CLI. Its hook runs each time.

**Without Context Mode:** a bare Node start takes 34.7 ms.

**With Context Mode:** the Gemini CLI hook takes 43.8 ms, so it adds about 9.2 ms to each tool call. Each number is the median of 5 hook runs.

**Tool:** hook (AfterTool). [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=g-hook-gemini)

**Rerun it yourself:**

```sh
cd bench && node run.mjs g-hook-gemini
```

<sub>Proof: input: small payloads built in the scenario. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## g-hook-qwen

**Hook latency, qwen adapter (PreToolUse, small payload)**

**What you do:** Run any tool call in Qwen Code. Its hook runs each time.

**Without Context Mode:** a bare Node start takes 31.1 ms.

**With Context Mode:** the Qwen Code hook takes 39.9 ms, so it adds about 8.0 ms to each tool call. Each number is the median of 5 hook runs.

**Tool:** hook (PreToolUse). [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=g-hook-qwen)

**Rerun it yourself:**

```sh
cd bench && node run.mjs g-hook-qwen
```

<sub>Proof: input: small payloads built in the scenario. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## g-hook-copilot-cli

**Hook latency, copilot-cli adapter (postToolUse, small payload)**

**What you do:** Run any tool call in Copilot CLI. Its hook runs each time.

**Without Context Mode:** a bare Node start takes 31.0 ms.

**With Context Mode:** the Copilot CLI hook takes 39.2 ms, so it adds about 8.2 ms to each tool call. Each number is the median of 5 hook runs.

**Tool:** hook (postToolUse). [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=g-hook-copilot-cli)

**Rerun it yourself:**

```sh
cd bench && node run.mjs g-hook-copilot-cli
```

<sub>Proof: input: small payloads built in the scenario. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## g-hook-vscode

**Hook latency, vscode adapter (PreToolUse, small payload)**

**What you do:** Run any tool call in VS Code. Its hook runs each time.

**Without Context Mode:** a bare Node start takes 30.6 ms.

**With Context Mode:** the VS Code hook takes 38.8 ms, so it adds about 8.8 ms to each tool call. Each number is the median of 5 hook runs.

**Tool:** hook (PreToolUse). [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=g-hook-vscode)

**Rerun it yourself:**

```sh
cd bench && node run.mjs g-hook-vscode
```

<sub>Proof: input: small payloads built in the scenario. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## g-hook-kiro

**Hook latency, kiro adapter (PreToolUse, small payload)**

**What you do:** Run any tool call in Kiro. Its hook runs each time.

**Without Context Mode:** a bare Node start takes 31.6 ms.

**With Context Mode:** the Kiro hook takes 38.8 ms, so it adds about 7.5 ms to each tool call. Each number is the median of 5 hook runs.

**Tool:** hook (PreToolUse). [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=g-hook-kiro)

**Rerun it yourself:**

```sh
cd bench && node run.mjs g-hook-kiro
```

<sub>Proof: input: small payloads built in the scenario. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## g-hook-zcode

**Hook latency, zcode adapter (PreToolUse, small payload)**

**What you do:** Run any tool call in ZCode. Its hook runs each time.

**Without Context Mode:** a bare Node start takes 31.7 ms.

**With Context Mode:** the ZCode hook takes 40.1 ms, so it adds about 7.6 ms to each tool call. Each number is the median of 5 hook runs.

**Tool:** hook (PreToolUse). [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=g-hook-zcode)

**Rerun it yourself:**

```sh
cd bench && node run.mjs g-hook-zcode
```

<sub>Proof: input: small payloads built in the scenario. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## g-hook-pi

**Hook latency, pi adapter (tool_result, small payload)**

**What you do:** Run any tool call in Pi. Its hook runs each time.

**Without Context Mode:** a bare Node start takes 30.6 ms.

**With Context Mode:** the Pi hook takes 39.4 ms, so it adds about 8.6 ms to each tool call. Each number is the median of 5 hook runs.

**Tool:** hook (tool_result). [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=g-hook-pi)

**Rerun it yourself:**

```sh
cd bench && node run.mjs g-hook-pi
```

<sub>Proof: input: small payloads built in the scenario. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## g-hook-opencode

**Hook latency, opencode adapter (execute.before, small payload)**

**What you do:** Run any tool call in OpenCode. Its hook runs each time.

**Without Context Mode:** a bare Node start takes 28.4 ms.

**With Context Mode:** the OpenCode hook takes 35.7 ms, so it adds about 7.6 ms to each tool call. Each number is the median of 5 hook runs.

**Tool:** hook (execute.before). [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=g-hook-opencode)

**Rerun it yourself:**

```sh
cd bench && node run.mjs g-hook-opencode
```

<sub>Proof: input: small payloads built in the scenario. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## g-search-latency

**ctx_search latency (20 queries over 8 indexed fixtures)**

**What you do:** Search 8 indexed tool outputs 20 times.

**Without Context Mode:** the agent reads the 8 outputs in full: 281,261 B, about 70,315 tokens.

**With Context Mode:** the 8 outputs go into a local search index. A search takes 1.6 ms (the slowest 6.7 ms), and a reply is about 3,664 B. The last reply:

````text
Query "export":
playwright-snapshot.txt #4: ```yaml
                - generic [ref=e130]:
                  - text: 13 points by
                  - link "matt_d" [ref=e131] [cursor=pointer]:
                    - /url: user?id=matt_d
                  - generic "2026-02-18T21:10:09 1771449009" [ref=e132]:
                    - link "1 hour ago" [ref=e133] [cursor=pointer]:
                      - /url: item?id=47066446
                  - text: "|"
                  - link "hide" [ref=e134] [cursor=pointer]:
                    - /url: hide?id=47066446&goto=news
````

First 12 of 57 lines.

**Tool:** ctx_search. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=g-search-latency)

**Rerun it yourself:**

```sh
cd bench && node run.mjs g-search-latency
```

<sub>Proof: input [fixtures/data/test-output.txt](../fixtures/data/test-output.txt), 6,185 B, sha256 bc0fd4973ba5a401025c7979d05183f6c7f2a5d7b0f4d4d023b4e933f2e06b0d; input [fixtures/data/tsc-errors.txt](../fixtures/data/tsc-errors.txt), 5,023 B, sha256 3ebc05d31d9ac68d3b950d05546f29b01586322660c38c8c94c4447c60cc359f; input [fixtures/data/build-output.txt](../fixtures/data/build-output.txt), 6,594 B, sha256 0e6a2387c978b36d37a4a3bc9030d0d0467ad43b8acd99d4a85a607fdc2e885e; input [fixtures/data/git-log.txt](../fixtures/data/git-log.txt), 11,895 B, sha256 d767dbdb990c98070c617a9c8d2263d267c596d3ecfcda4cc0a79743815e45ae; input [fixtures/data/access.log](../fixtures/data/access.log), 46,216 B, sha256 6e4fa9285b3435ff5f1bb28938124737a0e39035a2f535003b69c46f9e5ff085; input [fixtures/data/github-issues.json](../fixtures/data/github-issues.json), 60,310 B, sha256 2765ceace4b127b15ece4309eb1c91279f85b6107562a498a551657411cb182b; input [fixtures/data/analytics.csv](../fixtures/data/analytics.csv), 87,517 B, sha256 6dae0fc8f09d26e767e58ab0ba2a53aaaa014ddc7a2027aa3ca2f80111a19e54; input [fixtures/data/playwright-snapshot.txt](../fixtures/data/playwright-snapshot.txt), 57,521 B, sha256 ff62ad78ab7fff91de94fb3e5a4c38cd4b030aa01c4cdc3b305705e46dad1bec. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## g-index-per-mb

**ctx_index time per MB (3 real files, 0.6 MB)**

**What you do:** Put 0.6 MB of real files into the search index.

**Without Context Mode:** the agent reads the 3 files in full: 625,649 B, about 156,412 tokens.

**With Context Mode:** the files go into a local search index once. That takes 89 ms, or 150 ms per MB.

**Tool:** ctx_index. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=g-index-per-mb)

**Rerun it yourself:**

```sh
cd bench && node run.mjs g-index-per-mb
```

<sub>Proof: input [fixtures/data/github-api-issues-large.json](../fixtures/data/github-api-issues-large.json), 219,175 B, sha256 bd2bdb943de007b7bb57d4e4a53a01ad801cf57606a3228682b39d05eb8a5e16; input [fixtures/data/git-log-large.txt](../fixtures/data/git-log-large.txt), 191,120 B, sha256 028317819bc1a93fcfbeeba2d5ffea829fe4c439e3889d688f76fbb11bb913ad; input [fixtures/data/sqlite-fts5-docs.html](../fixtures/data/sqlite-fts5-docs.html), 215,354 B, sha256 de3092630358518a6869bf047055b3938e18b476e3fbc54f4e2146d1e593497f. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## g-session-total

**Full debugging session: 8 outputs through the hooks, 3 follow-up searches**

**What you do:** Debug for a full session: 8 tool outputs, then 3 searches.

**Without Context Mode:** All outputs go into the chat: 281,261 B, about 70,315 tokens.

The first of the 8 inputs starts like this:

```text
 RUN  v2.1.8 /Users/mert/projects/my-saas-app

 ✓ src/components/Button.test.tsx (3 tests) 45ms
   ✓ renders correctly 12ms
   ✓ handles click events 18ms
   ✓ applies variant classes 15ms
 ✓ src/components/Avatar.test.tsx (3 tests) 38ms
   ✓ renders with image 14ms
```

First 8 of 168 lines.

**With Context Mode:** The hooks swap each output for a short summary (1,305 B in total). 3 searches bring back what the agent needs (1,961 B). Below are the 3 search replies. The agent gets 3,266 B, about 817 tokens. That keeps 98.8% of it out of the chat.

```text
Query "failed tests":
Bash:cat data/test-output.txt#toolu_bench_001 #157:  Tests       4 failed | 108 passed (112)
Bash:cat data/test-output.txt#toolu_bench_001 #156:  Test Files  4 failed | 26 passed (30)
Bash:cat data/test-output.txt#toolu_bench_001 #9:  ✓ src/components/Card.test.tsx (4 tests) 52ms
More: ctx_search({queries:["failed tests"], scope:"session", offset:3})
Query "TS2339 property":
Bash:cat data/tsc-errors.txt#toolu_bench_002 #1: src/components/UserList.tsx(45,8): error TS2339: Property 'fullName' does not exist on type 'User'.
Bash:cat data/tsc-errors.txt#toolu_bench_002 #23: src/lib/auth.ts(41,18): error TS2339: Property 'accessToken' does not exist on type 'JWT'.
Bash:cat data/tsc-errors.txt#toolu_bench_002 #32: src/utils/helpers.ts(71,14): error TS2339: Property 'trim' does not exist on type 'number'.
Bash:cat data/tsc-errors.txt#toolu_bench_002 #8: src/components/Dashboard.tsx(34,19): error TS2339: Property 'metrics' does not exist on type 'DashboardData'.
Bash:cat data/tsc-errors.txt#toolu_bench_002 #37: src/lib/database.ts(42,9): error TS2339: Property 'transaction' does not exist on type 'PrismaClient'.
More: ctx_search({queries:["TS2339 property"], scope:"session", offset:5})
```

First 12 of 19 lines.

**Tool:** hooks + ctx_search. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=g-session-total)

**Rerun it yourself:**

```sh
cd bench && node run.mjs g-session-total
```

<sub>Proof: input [fixtures/data/test-output.txt](../fixtures/data/test-output.txt), 6,185 B, sha256 bc0fd4973ba5a401025c7979d05183f6c7f2a5d7b0f4d4d023b4e933f2e06b0d; input [fixtures/data/tsc-errors.txt](../fixtures/data/tsc-errors.txt), 5,023 B, sha256 3ebc05d31d9ac68d3b950d05546f29b01586322660c38c8c94c4447c60cc359f; input [fixtures/data/build-output.txt](../fixtures/data/build-output.txt), 6,594 B, sha256 0e6a2387c978b36d37a4a3bc9030d0d0467ad43b8acd99d4a85a607fdc2e885e; input [fixtures/data/git-log.txt](../fixtures/data/git-log.txt), 11,895 B, sha256 d767dbdb990c98070c617a9c8d2263d267c596d3ecfcda4cc0a79743815e45ae; input [fixtures/data/access.log](../fixtures/data/access.log), 46,216 B, sha256 6e4fa9285b3435ff5f1bb28938124737a0e39035a2f535003b69c46f9e5ff085; input [fixtures/data/github-issues.json](../fixtures/data/github-issues.json), 60,310 B, sha256 2765ceace4b127b15ece4309eb1c91279f85b6107562a498a551657411cb182b; input [fixtures/data/analytics.csv](../fixtures/data/analytics.csv), 87,517 B, sha256 6dae0fc8f09d26e767e58ab0ba2a53aaaa014ddc7a2027aa3ca2f80111a19e54; input [fixtures/data/playwright-snapshot.txt](../fixtures/data/playwright-snapshot.txt), 57,521 B, sha256 ff62ad78ab7fff91de94fb3e5a4c38cd4b030aa01c4cdc3b305705e46dad1bec. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>
