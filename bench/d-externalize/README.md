# D. Large output externalization (>100 KB kept whole in FTS5)

Each case here prints a very large output, more than 100 KB.  
Without Context Mode all of it goes into the chat. With Context Mode the full output goes into a local search index.  
The agent gets the start and a pointer, and a search finds any line later: here the first, middle and last line.

Run this group: `cd bench && node run.mjs d-externalize`. All tables: [results/2026-11-01-darwin-arm64.md](../results/2026-11-01-darwin-arm64.md).

## d-synth-120k

**Synthetic log, about 120 KB (seeded)**

**What you do:** Print a 120 KB log from a script.

**Without Context Mode:** The whole printed output goes into the chat: 80,008 B, about 20,002 tokens.

It starts like this (the scenario makes this text with a fixed seed):

```text
FIRSTMARK-7c1e req 1abd494f latency=367ms upstream=api-7 status=200
req 27dd34af latency=471ms upstream=api-17 status=200
req 14fa64db latency=252ms upstream=api-7 status=200
req 24d54255 latency=287ms upstream=api-2 status=200
req 1a4a1c03 latency=595ms upstream=api-8 status=200
req 10e959cc latency=205ms upstream=api-34 status=200
req 4c33a72 latency=115ms upstream=api-30 status=200
req 21870d96 latency=130ms upstream=api-7 status=200
```

**With Context Mode:** The full output goes into a local search index. The agent gets the start and a pointer. A search later finds the first, middle and last line (3 of 3). The agent gets 2,319 B, about 580 tokens. That keeps 97.1% of it out of the chat.

```text
exit 0 · 80008 B
ncy=233ms upstream=api-34 status=200
req 300c511 latency=124ms upstream=api-31 status=200
req 26df78fb latency=112ms upstream=api-13 status=200
req 1fc6d6c2 latency=455ms upstream=api-29 status=200
req 162a56b1 latency=307ms upstream=api-28 status=200
req 6e31970 latency=315ms upstream=api-27 status=200
req b91e313 latency=123ms upstream=api-31 status=200
req 16780925 latency=315ms upstream=api-24 status=500
req 408ef88 latency=229ms upstream=api-18 status=200
req 3309ee8e latency=457ms upstream=api-16 status=200
req 1d17e7c9 latency=142ms upstream=api-20 status=200
```

First 12 of 43 lines.

**Tool:** ctx_execute + ctx_search. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=d-synth-120k)

**Rerun it yourself:**

```sh
cd bench && node run.mjs d-synth-120k
```

<sub>Proof: input made in the scenario with a fixed seed (20261031). Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## d-synth-1m

**Synthetic log, about 1 MB (seeded)**

**What you do:** Print a 1 MB log from a script.

**Without Context Mode:** The whole printed output goes into the chat: 666,796 B, about 166,699 tokens.

It starts like this (the scenario makes this text with a fixed seed):

```text
FIRSTMARK-7c1e req 1abd494f latency=367ms upstream=api-7 status=200
req 27dd34af latency=471ms upstream=api-17 status=200
req 14fa64db latency=252ms upstream=api-7 status=200
req 24d54255 latency=287ms upstream=api-2 status=200
req 1a4a1c03 latency=595ms upstream=api-8 status=200
req 10e959cc latency=205ms upstream=api-34 status=200
req 4c33a72 latency=115ms upstream=api-30 status=200
req 21870d96 latency=130ms upstream=api-7 status=200
```

**With Context Mode:** The full output goes into a local search index. The agent gets the start and a pointer. A search later finds the first, middle and last line (3 of 3). The agent gets 3,380 B, about 845 tokens. That keeps 99.5% of it out of the chat.

```text
exit 0 · 666796 B
=186ms upstream=api-29 status=200
req 2d53e958 latency=256ms upstream=api-39 status=200
req 1b238e02 latency=429ms upstream=api-15 status=200
req 1bebd687 latency=731ms upstream=api-24 status=200
req f12033e latency=32ms upstream=api-34 status=200
req 3297ebfa latency=685ms upstream=api-27 status=200
req 3243a24 latency=95ms upstream=api-15 status=200
req 27eec629 latency=613ms upstream=api-14 status=200
req 1316d51a latency=281ms upstream=api-21 status=200
req 14e5401d latency=248ms upstream=api-28 status=200
req 896328b latency=692ms upstream=api-10 status=200
```

First 12 of 63 lines.

**Tool:** ctx_execute + ctx_search. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=d-synth-1m)

**Rerun it yourself:**

```sh
cd bench && node run.mjs d-synth-1m
```

<sub>Proof: input made in the scenario with a fixed seed (20261031). Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## d-real-github-json

**Real GitHub API payload printed whole (219 KB)**

**What you do:** Print a 219 KB GitHub API reply from a script.

**Without Context Mode:** The whole printed output goes into the chat: 219,175 B, about 54,794 tokens.

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

**With Context Mode:** The full output goes into a local search index. The agent gets the start and a pointer. A search later finds the first, middle and last line (3 of 3). The agent gets 4,060 B, about 1,015 tokens. That keeps 98.1% of it out of the chat.

```text
exit 0 · 219175 B
    ],
    "state": "open",
    "locked": false,
    "assignees": [
  "state": "open",
    "locked": false,
    "assignees": [
    ],
    "state": "open",
    "locked": false,
    "assignees": [
```

First 12 of 122 lines.

**Tool:** ctx_execute + ctx_search. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=d-real-github-json)

**Rerun it yourself:**

```sh
cd bench && node run.mjs d-real-github-json
```

<sub>Proof: input [fixtures/data/github-api-issues-large.json](../fixtures/data/github-api-issues-large.json), 219,175 B, sha256 bd2bdb943de007b7bb57d4e4a53a01ad801cf57606a3228682b39d05eb8a5e16. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## d-real-git-log

**Real git log printed whole (191 KB)**

**What you do:** Print a 191 KB git log from a script.

**Without Context Mode:** The whole printed output goes into the chat: 191,120 B, about 47,780 tokens.

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

**With Context Mode:** The full output goes into a local search index. The agent gets the start and a pointer. A search later finds the first, middle and last line (3 of 3). The agent gets 2,842 B, about 711 tokens. That keeps 98.5% of it out of the chat.

```text
exit 0 · 191120 B
view/issues-P1.json
857d0057 2026-10-14 review: docs/v2/review/out/r2/round1/review/issues-P3.json
97b70365 2026-10-14 review: docs/v2/review/out/r2/round1/review/issues-new.json
ca22fc31 2026-10-14 docs(v2): low-token review-lite workflow reusing saved round-1 results
454aac8c 2026-10-14 review: docs/v2/review/out/r2/round1/review/issues-P2.json
7b440891 2026-10-14 review: docs/v2/review/out/r2/round1/review/issues-I3.json
25147226 2026-10-14 review: docs/v2/review/out/r2/round1/review/issues-I1.json
175a5c2e 2026-10-14 review: docs/v2/review/out/r2/round1/review/v1-migration-sim.json
9bb3b9d1 2026-10-14 review: docs/v2/review/out/r2/round1/review/issues-I1.json
2044952d 2026-10-14 review: docs/v2/review/out/r2/round1/review/issues-I2.json
9965f8be 2026-10-14 review: docs/v2/review/out/r2/round1/review/issues-P0.json
```

First 12 of 36 lines.

**Tool:** ctx_execute + ctx_search. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=d-real-git-log)

**Rerun it yourself:**

```sh
cd bench && node run.mjs d-real-git-log
```

<sub>Proof: input [fixtures/data/git-log-large.txt](../fixtures/data/git-log-large.txt), 191,120 B, sha256 028317819bc1a93fcfbeeba2d5ffea829fe4c439e3889d688f76fbb11bb913ad. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>
