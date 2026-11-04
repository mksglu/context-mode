# E. Session continuity (compaction and resume)

Each case here is a work session that grows until the agent compacts the chat.  
Without Context Mode the agent needs the old tool outputs back to pick up the work.  
With Context Mode the hooks keep a journal of the session, and ctx_resume gives back a short summary.

Run this group: `cd bench && node run.mjs e-continuity`. All tables: [results/2026-11-01-darwin-arm64.md](../results/2026-11-01-darwin-arm64.md).

## e-debug-session

**Debugging session: 6 real outputs, then compaction**

**What you do:** Debug with 6 tool outputs, then compact the chat.

**Without Context Mode:** To pick up the work, the agent needs the old tool outputs back in the chat: 136,223 B, about 34,056 tokens.

The first of the 6 inputs starts like this:

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

**With Context Mode:** The hooks keep a journal of the session. After compaction, ctx_resume gives the agent a short summary. The agent gets 522 B, about 131 tokens. That keeps 99.6% of it out of the chat.

```text
<context_mode_state session="bench-e-debug-session" upto="6">
source s6: Bash:cat data/github-issues.json#toolu_bench_006 (60309 B)
source s5: Bash:cat data/access.log#toolu_bench_005 (46215 B)
source s4: Bash:cat data/git-log.txt#toolu_bench_004 (11894 B)
source s3: Bash:cat data/build-output.txt#toolu_bench_003 (6583 B)
source s2: Bash:cat data/tsc-errors.txt#toolu_bench_002 (5022 B)
source s1: Bash:cat data/test-output.txt#toolu_bench_001 (6174 B)
more: ctx_search(queries:[], scope:"session")
</context_mode_state>
```

**Tool:** hooks + ctx_resume. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=e-debug-session)

**Rerun it yourself:**

```sh
cd bench && node run.mjs e-debug-session
```

<sub>Proof: input [fixtures/data/test-output.txt](../fixtures/data/test-output.txt), 6,185 B, sha256 bc0fd4973ba5a401025c7979d05183f6c7f2a5d7b0f4d4d023b4e933f2e06b0d; input [fixtures/data/tsc-errors.txt](../fixtures/data/tsc-errors.txt), 5,023 B, sha256 3ebc05d31d9ac68d3b950d05546f29b01586322660c38c8c94c4447c60cc359f; input [fixtures/data/build-output.txt](../fixtures/data/build-output.txt), 6,594 B, sha256 0e6a2387c978b36d37a4a3bc9030d0d0467ad43b8acd99d4a85a607fdc2e885e; input [fixtures/data/git-log.txt](../fixtures/data/git-log.txt), 11,895 B, sha256 d767dbdb990c98070c617a9c8d2263d267c596d3ecfcda4cc0a79743815e45ae; input [fixtures/data/access.log](../fixtures/data/access.log), 46,216 B, sha256 6e4fa9285b3435ff5f1bb28938124737a0e39035a2f535003b69c46f9e5ff085; input [fixtures/data/github-issues.json](../fixtures/data/github-issues.json), 60,310 B, sha256 2765ceace4b127b15ece4309eb1c91279f85b6107562a498a551657411cb182b. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## e-long-session

**Long session: 40 synthetic outputs (seeded), then compaction**

**What you do:** Work through 40 tool outputs, then compact the chat.

**Without Context Mode:** To pick up the work, the agent needs the old tool outputs back in the chat: 442,893 B, about 110,723 tokens.

It starts like this (the scenario makes this text with a fixed seed):

```text
step 0 line 0 id=1abd494f took=367ms ok
step 0 line 1 id=3353a954 took=601ms ok
step 0 line 2 id=1a10c792 took=573ms ok
step 0 line 3 id=10bcbe3b took=164ms ok
step 0 line 4 id=24d54255 took=287ms ok
step 0 line 5 id=3804fb41 took=396ms ok
step 0 line 6 id=cbe81f3 took=326ms ok
step 0 line 7 id=d95a711 took=769ms ok
```

First 8 of 260 lines.

**With Context Mode:** The hooks keep a journal of the session. After compaction, ctx_resume gives the agent a short summary. The agent gets 2,019 B, about 505 tokens. That keeps 99.5% of it out of the chat.

```text
<context_mode_state session="bench-e-long-session" upto="40">
source s14: Bash:run step 39#toolu_bench_040 (11045 B)
source s13: Bash:run step 38#toolu_bench_039 (11162 B)
source s12: Bash:run step 37#toolu_bench_038 (11159 B)
source s11: Bash:run step 36#toolu_bench_037 (11189 B)
source s10: Bash:run step 35#toolu_bench_036 (11133 B)
source sz: Bash:run step 34#toolu_bench_035 (11186 B)
source sy: Bash:run step 33#toolu_bench_034 (11146 B)
source sx: Bash:run step 32#toolu_bench_033 (11159 B)
source sw: Bash:run step 31#toolu_bench_032 (11062 B)
source sv: Bash:run step 30#toolu_bench_031 (11117 B)
source su: Bash:run step 29#toolu_bench_030 (11147 B)
```

First 12 of 38 lines.

**Tool:** hooks + ctx_resume. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=e-long-session)

**Rerun it yourself:**

```sh
cd bench && node run.mjs e-long-session
```

<sub>Proof: input made in the scenario with a fixed seed (20261031). Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>
