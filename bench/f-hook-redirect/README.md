# F. Hook redirect (flooding calls denied or replaced)

Hooks run as the claude-code adapter. For WebFetch the body size is the size of the captured page the URL serves (the fixture); the real network is not used. The deny text is all the model gets; the follow-up call in the sandbox costs what group A or B shows for the same input.

Run this group: `cd bench && node run.mjs f-hook-redirect`. Latest tables: [results/2026-10-31-darwin-arm64.md](../results/2026-10-31-darwin-arm64.md).

## f-read-large-file

Read of a 46 KB log (denied, routed to ctx_execute)

- Command: `node run.mjs f-read-large-file`
- Input: `fixtures/data/access.log`, 46216 B, sha256 6e4fa9285b3435ff5f1bb28938124737a0e39035a2f535003b69c46f9e5ff085

## f-read-big-source

Read of a 61 KB source file (denied, routed to ctx_execute)

- Command: `node run.mjs f-read-big-source`
- Input: `fixtures/data/source-big.ts`, 61576 B, sha256 7b4ba6812418434b9c682875de2454668ed98f3e0791f9e2b528ac034ec6e725

## f-read-small-file

Read of a small file (allowed: nothing to save)

- Command: `node run.mjs f-read-small-file`
- Input: `fixtures/data/SOURCE.md`, 551 B, sha256 485500ba1dae92cf5b0ae83d0a30ba5abdc7af571d385febc4707cc899a276fd

## f-webfetch

WebFetch of a docs page (denied, routed to ctx_index + ctx_search)

- Command: `node run.mjs f-webfetch`
- Input: `fixtures/data/sqlite-fts5-docs.html`, 215354 B, sha256 de3092630358518a6869bf047055b3938e18b476e3fbc54f4e2146d1e593497f

## f-bash-dump-post

Bash dump of a 191 KB git log (PostToolUse replace)

- Command: `node run.mjs f-bash-dump-post`
- Input: `fixtures/data/git-log-large.txt`, 191120 B, sha256 028317819bc1a93fcfbeeba2d5ffea829fe4c439e3889d688f76fbb11bb913ad

## f-bash-curl-post

Bash curl of a 219 KB API payload (allowed before, replaced after)

- Command: `node run.mjs f-bash-curl-post`
- Input: `fixtures/data/github-api-issues-large.json`, 219175 B, sha256 bd2bdb943de007b7bb57d4e4a53a01ad801cf57606a3228682b39d05eb8a5e16
