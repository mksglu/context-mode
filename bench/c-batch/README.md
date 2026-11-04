# C. Batch (ctx_batch_execute equivalent: ctx_batch)

Each case here runs a few commands to check the state of a project.  
Without Context Mode each command is its own call, and all output goes into the chat.  
With Context Mode one ctx_batch call runs them all and answers the questions in one short reply.

Run this group: `cd bench && node run.mjs c-batch`. All tables: [results/2026-11-01-darwin-arm64.md](../results/2026-11-01-darwin-arm64.md).

## c-triage

**Triage: tests, tsc, build, nginx log, git log (5 commands, 5 queries)**

**What you do:** Check tests, type errors, the build, a server log and the git log in one step.

**Without Context Mode:** Each command runs as its own call, and all output goes into the chat: 75,913 B, about 18,978 tokens.

The first of the 5 inputs starts like this:

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

**With Context Mode:** One ctx_batch call runs all 5 commands, keeps the output in a local search index and answers the questions. The agent gets 6,222 B, about 1,556 tokens. That keeps 91.8% of it out of the chat.

```text
## failed tests
 Test Files  4 failed | 26 passed (30)
 Tests       4 failed | 108 passed (112)
 Start at    10:23:45
 Duration    4.21s (transform 1.23s, setup 0.89s, collect 2.09s, tests 3.87s, environment 0.34s, prepare 0.56s)
       at Object.<anonymous> (src/api/trpc/routers/user.test.ts:89:18)
   ✓ deletes user 52ms
   ✓ validates input schema 58ms
 ✓ src/api/trpc/routers/project.test.ts (4 tests) 178ms
   ✓ lists projects for user 34ms
   ✓ creates project with defaults 45ms
   ✓ updates project settings 48ms
```

First 12 of 119 lines.

**Tool:** ctx_batch. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=c-triage)

**Rerun it yourself:**

```sh
cd bench && node run.mjs c-triage
```

<sub>Proof: input [fixtures/data/test-output.txt](../fixtures/data/test-output.txt), 6,185 B, sha256 bc0fd4973ba5a401025c7979d05183f6c7f2a5d7b0f4d4d023b4e933f2e06b0d; input [fixtures/data/tsc-errors.txt](../fixtures/data/tsc-errors.txt), 5,023 B, sha256 3ebc05d31d9ac68d3b950d05546f29b01586322660c38c8c94c4447c60cc359f; input [fixtures/data/build-output.txt](../fixtures/data/build-output.txt), 6,594 B, sha256 0e6a2387c978b36d37a4a3bc9030d0d0467ad43b8acd99d4a85a607fdc2e885e; input [fixtures/data/access.log](../fixtures/data/access.log), 46,216 B, sha256 6e4fa9285b3435ff5f1bb28938124737a0e39035a2f535003b69c46f9e5ff085; input [fixtures/data/git-log.txt](../fixtures/data/git-log.txt), 11,895 B, sha256 d767dbdb990c98070c617a9c8d2263d267c596d3ecfcda4cc0a79743815e45ae. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## c-install-log

**Install log and big git log (2 commands, 3 queries)**

**What you do:** Check an install log and a long git log in one step.

**Without Context Mode:** Each command runs as its own call, and all output goes into the chat: 228,881 B, about 57,220 tokens.

The first of the 2 inputs starts like this:

```text
npm http fetch GET 200 https://registry.npmjs.org/@clack%2fprompts 326ms (cache miss)
npm http fetch GET 200 https://registry.npmjs.org/@modelcontextprotocol%2fsdk 74ms (cache miss)
npm http fetch GET 200 https://registry.npmjs.org/npm 458ms
npm http fetch GET 200 https://registry.npmjs.org/@cfworker%2fjson-schema 129ms (cache miss)
npm http fetch GET 200 https://registry.npmjs.org/@modelcontextprotocol%2fserver 723ms (cache miss)
npm http fetch GET 200 https://registry.npmjs.org/@types%2fnode 488ms (cache miss)
npm http fetch GET 200 https://registry.npmjs.org/esbuild 169ms (cache miss)
npm http fetch GET 200 https://registry.npmjs.org/htmlparser2 85ms (cache miss)
```

First 8 of 399 lines.

**With Context Mode:** One ctx_batch call runs all 2 commands, keeps the output in a local search index and answers the questions. The agent gets 12,797 B, about 3,199 tokens. That keeps 94.4% of it out of the chat.

```text
## cache miss
y.npmjs.org/@esbuild%2fwin32-x64 282ms (cache miss)
npm http fetch GET 200 https://registry.npmjs.org/@esbuild%2flinux-s390x 79ms (cache miss)
npm http fetch GET 200 https://registry.npmjs.org/@esbuild%2fopenbsd-x64 101ms (cache miss)
npm http fetch GET 200 https://registry.npmjs.org/@esbuild%2fwin32-arm64 99ms (cache miss)
npm http fetch GET 200 https://registry.npmjs.org/@esbuild%2fdarwin-arm64 99ms (cache miss)
npm http fetch GET 200 https://registry.npmjs.org/@esbuild%2fopenbsd-arm64 91ms (cache miss)
npm http fetch GET 200 https://registry.npmjs.org/@esbuild%2flinux-mips64el 84ms (cache miss)
npm http fetch GET 200 https://registry.npmjs.org/@esbuild%2fandroid-arm64 128ms (cache miss)
npm http fetch GET 200 https://registry.npmjs.org/@esbuild%2flinux-riscv64 102ms (cache miss)
npm http fetch GET 200 https://registry.npmjs.org/@esbuild%2flinux-loong64 121ms (cache miss)
npm http fetch GET 200 https://registry.npmjs.org/entities 86ms (cache miss)
```

First 12 of 154 lines.

**Tool:** ctx_batch. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=c-install-log)

**Rerun it yourself:**

```sh
cd bench && node run.mjs c-install-log
```

<sub>Proof: input [fixtures/data/npm-install-log.txt](../fixtures/data/npm-install-log.txt), 37,761 B, sha256 54fe053a4c8ece97a96bef23b019a9120a230af1e17eddd70d4a046dd48a9af0; input [fixtures/data/git-log-large.txt](../fixtures/data/git-log-large.txt), 191,120 B, sha256 028317819bc1a93fcfbeeba2d5ffea829fe4c439e3889d688f76fbb11bb913ad. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## c-small

**Small outputs (3 tiny commands, 2 queries): batch has fixed overhead**

**What you do:** Run 3 tiny commands in one step.

**Without Context Mode:** Each command runs as its own call, and all output goes into the chat: 19 B, about 5 tokens.

The command output looks like this:

```text
v26.8.1
true
ready
```

**With Context Mode:** One ctx_batch call runs all 3 commands, keeps the output in a local search index and answers the questions. The agent gets 81 B, about 20 tokens. Here the reply is a bit larger than the raw output: small outputs are cheap to read as they are.

```text
## node version
v26.8.1
## ready
ready
$ git rev-parse --is-inside-work-tree
true
```

**Tool:** ctx_batch. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=c-small)

**Rerun it yourself:**

```sh
cd bench && node run.mjs c-small
```

<sub>Proof: input: small payloads built in the scenario. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>
