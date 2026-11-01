# C. Batch (ctx_batch_execute equivalent: ctx_batch)

Native = the sum of the raw outputs of the same commands run as separate Bash calls. The last row has tiny outputs on purpose: the batch reply header is a fixed cost and there is nothing to save.

Run this group: `cd bench && node run.mjs c-batch`. Latest tables: [results/2026-11-01-darwin-arm64.md](../results/2026-11-01-darwin-arm64.md).

## c-triage

Triage: tests, tsc, build, nginx log, git log (5 commands, 5 queries)

- Command: `node run.mjs c-triage`
- Input: `fixtures/data/test-output.txt`, 6185 B, sha256 bc0fd4973ba5a401025c7979d05183f6c7f2a5d7b0f4d4d023b4e933f2e06b0d
- Input: `fixtures/data/tsc-errors.txt`, 5023 B, sha256 3ebc05d31d9ac68d3b950d05546f29b01586322660c38c8c94c4447c60cc359f
- Input: `fixtures/data/build-output.txt`, 6594 B, sha256 0e6a2387c978b36d37a4a3bc9030d0d0467ad43b8acd99d4a85a607fdc2e885e
- Input: `fixtures/data/access.log`, 46216 B, sha256 6e4fa9285b3435ff5f1bb28938124737a0e39035a2f535003b69c46f9e5ff085
- Input: `fixtures/data/git-log.txt`, 11895 B, sha256 d767dbdb990c98070c617a9c8d2263d267c596d3ecfcda4cc0a79743815e45ae

## c-install-log

Install log and big git log (2 commands, 3 queries)

- Command: `node run.mjs c-install-log`
- Input: `fixtures/data/npm-install-log.txt`, 37761 B, sha256 54fe053a4c8ece97a96bef23b019a9120a230af1e17eddd70d4a046dd48a9af0
- Input: `fixtures/data/git-log-large.txt`, 191120 B, sha256 028317819bc1a93fcfbeeba2d5ffea829fe4c439e3889d688f76fbb11bb913ad

## c-small

Small outputs (3 tiny commands, 2 queries): batch has fixed overhead

- Command: `node run.mjs c-small`
- Input: none (small payloads built in the scenario)
