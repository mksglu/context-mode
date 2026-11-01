# D. Large output externalization (>100 KB kept whole in FTS5)

The script prints everything; the agent gets a capped reply with a pointer, and the full output is searchable. 'Found' counts the first, middle and last line markers returned by ctx_search. For the real files the markers are the first, middle and last line of the file.

Run this group: `cd bench && node run.mjs d-externalize`. Latest tables: [results/2026-11-01-darwin-arm64.md](../results/2026-11-01-darwin-arm64.md).

## d-synth-120k

Synthetic log, about 120 KB (seeded)

- Command: `node run.mjs d-synth-120k`
- Input: synthetic, generated in the scenario with a fixed seed (20261031)

## d-synth-1m

Synthetic log, about 1 MB (seeded)

- Command: `node run.mjs d-synth-1m`
- Input: synthetic, generated in the scenario with a fixed seed (20261031)

## d-real-github-json

Real GitHub API payload printed whole (219 KB)

- Command: `node run.mjs d-real-github-json`
- Input: `fixtures/data/github-api-issues-large.json`, 219175 B, sha256 bd2bdb943de007b7bb57d4e4a53a01ad801cf57606a3228682b39d05eb8a5e16

## d-real-git-log

Real git log printed whole (191 KB)

- Command: `node run.mjs d-real-git-log`
- Input: `fixtures/data/git-log-large.txt`, 191120 B, sha256 028317819bc1a93fcfbeeba2d5ffea829fe4c439e3889d688f76fbb11bb913ad
