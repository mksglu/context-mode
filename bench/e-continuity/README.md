# E. Session continuity (compaction and resume)

Native = the raw tool outputs that a transcript replay would carry. context-mode = the SessionStart(compact) state block, ctx_resume, and the UserPromptSubmit recall block. 'Recall found' means the recall block for a prompt holds a line that answers it. This measures bytes and presence of the answer, not whether a model keeps working well after compaction.

Run this group: `cd bench && node run.mjs e-continuity`. Latest tables: [results/2026-11-01-darwin-arm64.md](../results/2026-11-01-darwin-arm64.md).

## e-debug-session

Debugging session: 6 real outputs, then compaction

- Command: `node run.mjs e-debug-session`
- Input: `fixtures/data/test-output.txt`, 6185 B, sha256 bc0fd4973ba5a401025c7979d05183f6c7f2a5d7b0f4d4d023b4e933f2e06b0d
- Input: `fixtures/data/tsc-errors.txt`, 5023 B, sha256 3ebc05d31d9ac68d3b950d05546f29b01586322660c38c8c94c4447c60cc359f
- Input: `fixtures/data/build-output.txt`, 6594 B, sha256 0e6a2387c978b36d37a4a3bc9030d0d0467ad43b8acd99d4a85a607fdc2e885e
- Input: `fixtures/data/git-log.txt`, 11895 B, sha256 d767dbdb990c98070c617a9c8d2263d267c596d3ecfcda4cc0a79743815e45ae
- Input: `fixtures/data/access.log`, 46216 B, sha256 6e4fa9285b3435ff5f1bb28938124737a0e39035a2f535003b69c46f9e5ff085
- Input: `fixtures/data/github-issues.json`, 60310 B, sha256 2765ceace4b127b15ece4309eb1c91279f85b6107562a498a551657411cb182b

## e-long-session

Long session: 40 synthetic outputs (seeded), then compaction

- Command: `node run.mjs e-long-session`
- Input: synthetic, generated in the scenario with a fixed seed (20261031)
