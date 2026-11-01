# G. Overhead (hook latency, search latency, index time, full session)

Each hook row is the median of 5 hook processes inside one run, a fresh process each (no daemon), minus the median of 5 bare `node -e ""` starts. The small payload is an allowed command, so this is the fixed cost of every tool call.

Run this group: `cd bench && node run.mjs g-overhead`. Latest tables: [results/2026-11-01-darwin-arm64.md](../results/2026-11-01-darwin-arm64.md).

## g-hook-claude-code

Hook latency, claude-code adapter (PostToolUse, small payload)

- Command: `node run.mjs g-hook-claude-code`
- Input: none (small payloads built in the scenario)

## g-hook-codex

Hook latency, codex adapter (PreToolUse, small payload)

- Command: `node run.mjs g-hook-codex`
- Input: none (small payloads built in the scenario)

## g-hook-gemini

Hook latency, gemini adapter (AfterTool, small payload)

- Command: `node run.mjs g-hook-gemini`
- Input: none (small payloads built in the scenario)

## g-hook-qwen

Hook latency, qwen adapter (PreToolUse, small payload)

- Command: `node run.mjs g-hook-qwen`
- Input: none (small payloads built in the scenario)

## g-hook-copilot-cli

Hook latency, copilot-cli adapter (postToolUse, small payload)

- Command: `node run.mjs g-hook-copilot-cli`
- Input: none (small payloads built in the scenario)

## g-hook-vscode

Hook latency, vscode adapter (PreToolUse, small payload)

- Command: `node run.mjs g-hook-vscode`
- Input: none (small payloads built in the scenario)

## g-hook-kiro

Hook latency, kiro adapter (PreToolUse, small payload)

- Command: `node run.mjs g-hook-kiro`
- Input: none (small payloads built in the scenario)

## g-hook-zcode

Hook latency, zcode adapter (PreToolUse, small payload)

- Command: `node run.mjs g-hook-zcode`
- Input: none (small payloads built in the scenario)

## g-hook-pi

Hook latency, pi adapter (tool_result, small payload)

- Command: `node run.mjs g-hook-pi`
- Input: none (small payloads built in the scenario)

## g-hook-opencode

Hook latency, opencode adapter (execute.before, small payload)

- Command: `node run.mjs g-hook-opencode`
- Input: none (small payloads built in the scenario)

## g-search-latency

ctx_search latency (20 queries over 8 indexed fixtures)

- Command: `node run.mjs g-search-latency`
- Input: `fixtures/data/test-output.txt`, 6185 B, sha256 bc0fd4973ba5a401025c7979d05183f6c7f2a5d7b0f4d4d023b4e933f2e06b0d
- Input: `fixtures/data/tsc-errors.txt`, 5023 B, sha256 3ebc05d31d9ac68d3b950d05546f29b01586322660c38c8c94c4447c60cc359f
- Input: `fixtures/data/build-output.txt`, 6594 B, sha256 0e6a2387c978b36d37a4a3bc9030d0d0467ad43b8acd99d4a85a607fdc2e885e
- Input: `fixtures/data/git-log.txt`, 11895 B, sha256 d767dbdb990c98070c617a9c8d2263d267c596d3ecfcda4cc0a79743815e45ae
- Input: `fixtures/data/access.log`, 46216 B, sha256 6e4fa9285b3435ff5f1bb28938124737a0e39035a2f535003b69c46f9e5ff085
- Input: `fixtures/data/github-issues.json`, 60310 B, sha256 2765ceace4b127b15ece4309eb1c91279f85b6107562a498a551657411cb182b
- Input: `fixtures/data/analytics.csv`, 87517 B, sha256 6dae0fc8f09d26e767e58ab0ba2a53aaaa014ddc7a2027aa3ca2f80111a19e54
- Input: `fixtures/data/playwright-snapshot.txt`, 57521 B, sha256 ff62ad78ab7fff91de94fb3e5a4c38cd4b030aa01c4cdc3b305705e46dad1bec

## g-index-per-mb

ctx_index time per MB (3 real files, 0.6 MB)

- Command: `node run.mjs g-index-per-mb`
- Input: `fixtures/data/github-api-issues-large.json`, 219175 B, sha256 bd2bdb943de007b7bb57d4e4a53a01ad801cf57606a3228682b39d05eb8a5e16
- Input: `fixtures/data/git-log-large.txt`, 191120 B, sha256 028317819bc1a93fcfbeeba2d5ffea829fe4c439e3889d688f76fbb11bb913ad
- Input: `fixtures/data/sqlite-fts5-docs.html`, 215354 B, sha256 de3092630358518a6869bf047055b3938e18b476e3fbc54f4e2146d1e593497f

## g-session-total

Full debugging session: 8 outputs through the hooks, 3 follow-up searches

- Command: `node run.mjs g-session-total`
- Input: `fixtures/data/test-output.txt`, 6185 B, sha256 bc0fd4973ba5a401025c7979d05183f6c7f2a5d7b0f4d4d023b4e933f2e06b0d
- Input: `fixtures/data/tsc-errors.txt`, 5023 B, sha256 3ebc05d31d9ac68d3b950d05546f29b01586322660c38c8c94c4447c60cc359f
- Input: `fixtures/data/build-output.txt`, 6594 B, sha256 0e6a2387c978b36d37a4a3bc9030d0d0467ad43b8acd99d4a85a607fdc2e885e
- Input: `fixtures/data/git-log.txt`, 11895 B, sha256 d767dbdb990c98070c617a9c8d2263d267c596d3ecfcda4cc0a79743815e45ae
- Input: `fixtures/data/access.log`, 46216 B, sha256 6e4fa9285b3435ff5f1bb28938124737a0e39035a2f535003b69c46f9e5ff085
- Input: `fixtures/data/github-issues.json`, 60310 B, sha256 2765ceace4b127b15ece4309eb1c91279f85b6107562a498a551657411cb182b
- Input: `fixtures/data/analytics.csv`, 87517 B, sha256 6dae0fc8f09d26e767e58ab0ba2a53aaaa014ddc7a2027aa3ca2f80111a19e54
- Input: `fixtures/data/playwright-snapshot.txt`, 57521 B, sha256 ff62ad78ab7fff91de94fb3e5a4c38cd4b030aa01c4cdc3b305705e46dad1bec
