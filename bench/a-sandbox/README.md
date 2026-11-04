# A. Tool output processed in the sandbox (ctx_execute with `file`)

Each case here is one tool output an agent reads every day: docs, test runs, logs, API replies.  
Without Context Mode the whole output goes into the chat. With Context Mode a short script reads it in a sandbox.  
The agent gets only the lines the script prints, and the raw output stays out of the chat.

Run this group: `cd bench && node run.mjs a-sandbox`. All tables: [results/2026-11-01-darwin-arm64.md](../results/2026-11-01-darwin-arm64.md).

## a-context7-react-docs

**React useEffect docs**

**What you do:** Look up the React useEffect docs through Context7.

**Without Context Mode:** The whole tool output goes into the chat: 6,075 B, about 1,519 tokens.

It starts like this:

````text
### useEffect Hook Reference

Source: https://react.dev/reference/react/useEffect

The useEffect Hook allows you to declare side effects in functional components. It accepts a setup function and optional dependencies array, running the setup a ...

```APIDOC
## useEffect Hook
````

First 8 of 161 lines. Lines over 160 characters are cut.

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 261 B, about 65 tokens. That keeps 95.7% of it out of the chat.

```text
Context7 — React Docs Summary
Lines: 162 | Sections: 4 | Code blocks: 5
APIs mentioned: useLayoutEffect, useEffect, useChatRoom
Key topics:
  - Cleanup functions
  - Dependency arrays
  - Data fetching patterns
Total size: 6075 chars → 5 examples extracted
```

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-context7-react-docs)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-context7-react-docs
```

<sub>Proof: input [fixtures/data/context7-react-docs.md](../fixtures/data/context7-react-docs.md), 6,075 B, sha256 c0ee0d81f97dd86973cb8355a37ffa58eb1a3efad82371e2128ccdd75c9f3d4f. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-context7-nextjs-docs

**Next.js App Router docs**

**What you do:** Look up the Next.js App Router docs through Context7.

**Without Context Mode:** The whole tool output goes into the chat: 6,658 B, about 1,665 tokens.

It starts like this:

````text
### Create Server Component Page with Data Fetching in Next.js App Directory

Source: https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/migrating/app-router-migration.mdx

Shows how to create a new page.tsx file in the app directory that acts as a Server Component by default. This component imports the Client Component and handles ...

```typescript
// Import your Client Component
````

First 8 of 223 lines. Lines over 160 characters are cut.

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 249 B, about 62 tokens. That keeps 96.3% of it out of the chat.

```text
Context7 — Next.js App Router Summary
Lines: 224 | Sections: 5 | Code blocks: 9
Data fetching patterns: async components, caching strategies, ISR/revalidation, no-cache SSR
Migration from Pages Router: Yes
Total size: 6658 chars → summary above
```

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-context7-nextjs-docs)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-context7-nextjs-docs
```

<sub>Proof: input [fixtures/data/context7-nextjs-docs.md](../fixtures/data/context7-nextjs-docs.md), 6,658 B, sha256 b687675406d856b451d05ccb702c345a47849969295d19b2b21d2fede213620b. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-context7-tailwind-docs

**Tailwind CSS docs**

**What you do:** Look up the Tailwind CSS docs through Context7.

**Without Context Mode:** The whole tool output goes into the chat: 4,102 B, about 1,026 tokens.

It starts like this:

````text
### Apply responsive flex layout with Tailwind CSS

Source: https://github.com/tailwindlabs/tailwindcss.com/blob/main/src/docs/responsive-design.mdx

Demonstrates how to create a responsive layout that switches from block display on mobile to flex display on medium screens and larger. Uses md:flex to enable f ...

```html
<div class="md:flex">
````

First 8 of 87 lines. Lines over 160 characters are cut.

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 186 B, about 47 tokens. That keeps 95.5% of it out of the chat.

```text
Context7 — Tailwind CSS Summary
Lines: 88 | Code blocks: 6
Total classes found: 56
Responsive variants: 8 → md, lg, sm
Flex/Grid classes: 13
Total size: 4102 chars → summary above
```

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-context7-tailwind-docs)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-context7-tailwind-docs
```

<sub>Proof: input [fixtures/data/context7-tailwind-docs.md](../fixtures/data/context7-tailwind-docs.md), 4,102 B, sha256 d0307fa05b356fbd45451317ffeb324dcbf959577772a9da0b7c87d9c98d7a02. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-playwright-snapshot

**Page snapshot (HN)**

**What you do:** Take a Playwright snapshot of the Hacker News front page.

**Without Context Mode:** The whole tool output goes into the chat: 57,521 B, about 14,380 tokens.

It starts like this:

````text
### Page
- Page URL: https://news.ycombinator.com/
- Page Title: Hacker News
### Snapshot
```yaml
- table [ref=e3]:
  - rowgroup [ref=e4]:
    - row "Hacker Newsnew | past | comments | ask | show | jobs | submit login" [ref=e5]:
````

First 8 of 1,044 lines.

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 299 B, about 75 tokens. That keeps 99.5% of it out of the chat.

```text
Playwright — Page Snapshot Summary
Lines: 1044 | DOM refs: 647
Links: 219 | Buttons: 0 | Text nodes: 162
Stories found: 30
Top 5:
  1. Hacker News
  2. I built Timeframe, our family e-paper dashboard
  3. hawksley.org
  4. saeedesmaili
  5. 8 hours ago
Raw snapshot: 57515 chars → summary above
```

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-playwright-snapshot)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-playwright-snapshot
```

<sub>Proof: input [fixtures/data/playwright-snapshot.txt](../fixtures/data/playwright-snapshot.txt), 57,521 B, sha256 ff62ad78ab7fff91de94fb3e5a4c38cd4b030aa01c4cdc3b305705e46dad1bec. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-playwright-network

**Network requests**

**What you do:** List the network requests of a page in Playwright.

**Without Context Mode:** The whole tool output goes into the chat: 400 B, about 100 tokens.

It starts like this:

```text
[GET] https://news.ycombinator.com/ => [200]
[GET] https://news.ycombinator.com/news.css?u2KnqsTjKhcQjbDNi8PU => [200]
[GET] https://news.ycombinator.com/y18.svg => [200]
[GET] https://news.ycombinator.com/s.gif => [200]
[GET] https://news.ycombinator.com/hn.js?u2KnqsTjKhcQjbDNi8PU => [200]
[GET] https://news.ycombinator.com/triangle.svg => [200]
[GET] https://news.ycombinator.com/y18.svg => [200]
```

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 349 B, about 87 tokens. That keeps 12.7% of it out of the chat.

```text
Playwright — Network Summary
Requests: 7
Status: https://news.ycombinator.com/:1, https://news.ycombinator.com/news.css?u2KnqsTjKhcQjbDNi8PU:1, https://news.ycombinator.com/y18.svg:2, https://news.ycombinator.com/s.gif:1, https://news.ycombi ...
Types: doc:1, other:6
```

Lines over 200 characters are cut.

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-playwright-network)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-playwright-network
```

<sub>Proof: input [fixtures/data/playwright-network.txt](../fixtures/data/playwright-network.txt), 400 B, sha256 016b08806075962abb8b0ebd160d9cb5c5ca3aa0055dd4a10ef52894b1ffed20. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-github-prs

**PR list (Next.js)**

**What you do:** List the open pull requests of vercel/next.js.

**Without Context Mode:** The whole tool output goes into the chat: 6,561 B, about 1,640 tokens.

It starts like this:

```text
[{"additions":59,"author":{"id":"U_kgDOD1JpZw","is_bot":false,"login":"youngsyre26","name":""},"body":"## Description\n\nAdds a new getting started guide for Next.js Middleware, covering:\n- Basic middleware setup\n- Overview of middleware capabilities\n- Links to existing documentation\n\n## Related\n\n- https://nextjs.org/docs/app/building-your-application/routing/middleware","changedFiles":1,"deletions":0,"labels":[{"id":"LA_kwDOBC3Cis7ZQfu6","name":"Documentation","descri ...
```

The output is one line of 6,561 B. These are its first 480 characters.

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 719 B, about 180 tokens. That keeps 89.0% of it out of the chat.

```text
GitHub — PR List Summary
PRs: 5 | Repo: vercel/next.js
  #90342 docs: add middleware overview guide
    by youngsyre26 | +59 -0 | 1 files | labels: Documentation
  #90322 Identify actionable bugs and technical debt in core packages
    by poria-lang | +0 -0 | 0 files | labels: none
  #90316 Add PR tarball install note to stats comment
    by devjiwonchoi | +20 -0 | 1 files | labels: created-by: Next.js team
  #90312 Fix route.replace crash with --debug-build-paths
    by devjiwonchoi | +4 -1 | 1 files | labels: type: next, created-by: Next.js team
  #90290 fix: handle file:// URLs in cacheHandler for ESM configs
    by TheAbMehta | +83 -20 | 5 files | labels: type: next, tests
```

First 12 of 13 lines.

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-github-prs)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-github-prs
```

<sub>Proof: input [fixtures/data/github-prs.json](../fixtures/data/github-prs.json), 6,561 B, sha256 c8aba6ce93e3302b6ca8660a4c3b1d4c0a044878386e8f240b222f369d1454ef. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-github-issues

**Issues (React)**

**What you do:** List the open issues of facebook/react.

**Without Context Mode:** The whole tool output goes into the chat: 60,310 B, about 15,078 tokens.

It starts like this:

````text
[{"author":{"id":"MDQ6VXNlcjI0NDAwODk=","is_bot":false,"login":"rickhanlonii","name":"Ricky"},"body":"Noticed this while writing docs:\n\n```js\n<ViewTransition\n  onEnter={(instance) => {\n    const anim = instance.new.animate(/* ... */);\n    return () => {\n      anim.cancel();\n    };\n  }}\n  onExit={(instance) => {\n    const anim = instance.new.animate(/* ... */);\n    return () => {\n      anim.cancel();\n    };\n  }}\n>\n  {/* ... */}    \n</ViewTransition>\n```\n\nI ...
````

The output is one line of 60,310 B. These are its first 480 characters.

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 1,139 B, about 285 tokens. That keeps 98.1% of it out of the chat.

```text
GitHub — Issues Summary
Issues: 20 | Repo: facebook/react

By label:
  Status: Unconfirmed: 19
  Type: Bug: 7
  Component: Developer Tools: 3
  Component: Suspense: 1

Recent issues:
  #35855 Bug: ViewTransition onExit cleanup not called on unmount
    by rickhanlonii [Status: Unconfirmed]
```

First 12 of 26 lines.

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-github-issues)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-github-issues
```

<sub>Proof: input [fixtures/data/github-issues.json](../fixtures/data/github-issues.json), 60,310 B, sha256 2765ceace4b127b15ece4309eb1c91279f85b6107562a498a551657411cb182b. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-test-output

**Test output (30 suites)**

**What you do:** Run a test suite of 30 test files.

**Without Context Mode:** The whole tool output goes into the chat: 6,185 B, about 1,546 tokens.

It starts like this:

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

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 337 B, about 84 tokens. That keeps 94.6% of it out of the chat.

```text
vitest — Test Results Summary
Suites: 26 passed, 4 failed
Tests: 132 passed, 8 failed
Failures:
  ✗ src/components/UserList.test.tsx (4 tests) 234ms
  ✗ handles empty state 156ms
  ✗ src/components/DataGrid.test.tsx (5 tests) 345ms
  ✗ filters with complex queries 198ms
  ✗ src/api/trpc/routers/user.test.ts (5 tests) 456ms
```

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-test-output)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-test-output
```

<sub>Proof: input [fixtures/data/test-output.txt](../fixtures/data/test-output.txt), 6,185 B, sha256 bc0fd4973ba5a401025c7979d05183f6c7f2a5d7b0f4d4d023b4e933f2e06b0d. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-tsc-errors

**TypeScript errors (50)**

**What you do:** Type-check a project that has 50 TypeScript errors.

**Without Context Mode:** The whole tool output goes into the chat: 5,023 B, about 1,256 tokens.

It starts like this:

```text
src/components/UserList.tsx(23,15): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
src/components/UserList.tsx(45,8): error TS2339: Property 'fullName' does not exist on type 'User'.
src/components/UserList.tsx(67,22): error TS2532: Object is possibly 'undefined'.
src/components/UserList.tsx(89,3): error TS2741: Property 'email' is missing in type '{ name: string; }' but required in type 'User'.
src/components/UserList.tsx(102,18): error TS2769: No overload matches this call.
src/components/UserList.tsx(118,11): error TS7006: Parameter 'user' implicitly has an 'any' type.
src/components/UserList.tsx(134,27): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
src/components/Dashboard.tsx(15,5): error TS2322: Type 'null' is not assignable to type 'ReactElement'.
```

First 8 of 50 lines.

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 347 B, about 87 tokens. That keeps 93.1% of it out of the chat.

```text
tsc — Error Summary
Errors: 50 in 8 files
By file:
  src/components/UserList.tsx: 7
  src/components/Dashboard.tsx: 7
  src/api/trpc/routers/user.ts: 7
  src/lib/auth.ts: 7
  src/utils/helpers.ts: 7
  src/lib/database.ts: 7
  src/config/config.ts: 4
  src/types/types.ts: 4
Top codes:
```

First 12 of 17 lines.

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-tsc-errors)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-tsc-errors
```

<sub>Proof: input [fixtures/data/tsc-errors.txt](../fixtures/data/tsc-errors.txt), 5,023 B, sha256 3ebc05d31d9ac68d3b950d05546f29b01586322660c38c8c94c4447c60cc359f. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-build-output

**Build output (100+ lines)**

**What you do:** Build a Next.js app.

**Without Context Mode:** The whole tool output goes into the chat: 6,594 B, about 1,649 tokens.

It starts like this:

```text
  ▲ Next.js 15.1.0
  - Environments: .env.local

   Creating an optimized production build ...
  ✓ Compiled src/app/page.tsx (342ms)
  ✓ Compiled src/app/layout.tsx (128ms)
  ✓ Compiled src/app/loading.tsx (45ms)
  ✓ Compiled src/app/error.tsx (52ms)
```

First 8 of 122 lines.

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 405 B, about 101 tokens. That keeps 93.9% of it out of the chat.

```text
next build — Summary
Lines: 123 | Routes: 2 | Warnings: 12 | Errors: 5
Error lines:
  ✓ Compiled src/app/error.tsx (52ms)
  ERROR in src/api/trpc/routers/user.ts(45,12): TS2345: Argument of type 'string' is not assignable to parameter of type 'UserRole'.
  ERROR in src/middleware.ts(23,8): TS2345: Argument of type '{ callbackUrl: string; }' is not assignable to parameter of type 'URLSearchParams'.
```

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-build-output)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-build-output
```

<sub>Proof: input [fixtures/data/build-output.txt](../fixtures/data/build-output.txt), 6,594 B, sha256 0e6a2387c978b36d37a4a3bc9030d0d0467ad43b8acd99d4a85a607fdc2e885e. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-mcp-tools

**MCP tools (40 tools)**

**What you do:** Read the list of 40 tools that an MCP server offers.

**Without Context Mode:** The whole tool output goes into the chat: 17,362 B, about 4,341 tokens.

It starts like this:

```text
[
  {
    "name": "search_codebase",
    "description": "Search for code patterns across the codebase using ripgrep",
    "inputSchema": {
      "type": "object",
      "properties": {
        "pattern": { "type": "string", "description": "Regex pattern to search for" },
```

First 8 of 491 lines.

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 742 B, about 186 tokens. That keeps 95.7% of it out of the chat.

```text
MCP — Tools Discovery Summary
Total tools: 40
Categories: search:2, read:1, write:1, edit:1, list:1, run:3, git:5, lint:1, format:1, typecheck:1, deploy:1, database:2, create:2, find:2, get:1, install:1, uninstall:1, view:1, open:1, take:1, check ...

Tool signatures:
  search_codebase(pattern, path?, fileType?)
  read_file(path, startLine?, endLine?)
  write_file(path, content)
  edit_file(path, oldText, newText)
  list_directory(path, recursive?, maxDepth?)
  run_command(command, cwd?, timeout?)
  run_tests(testPath?, filter?, watch?, coverage?)
```

First 12 of 16 lines. Lines over 200 characters are cut.

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-mcp-tools)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-mcp-tools
```

<sub>Proof: input [fixtures/data/mcp-tools.json](../fixtures/data/mcp-tools.json), 17,362 B, sha256 290dac23e92d735bfc532c6e757df79725217e4871326cdffcb878c0ada973ef. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-access

**Access log (500 req)**

**What you do:** Read 500 lines of an nginx access log.

**Without Context Mode:** The whole tool output goes into the chat: 46,216 B, about 11,554 tokens.

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

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 155 B, about 39 tokens. That keeps 99.7% of it out of the chat.

```text
nginx — Access Log Summary
Requests: 500 | Errors: 88 (17.6%)
Avg latency: 300ms
Status: 200:361, 201:38, 401:25, 403:24, 204:13, 400:13, 404:13, 500:13
```

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-access)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-access
```

<sub>Proof: input [fixtures/data/access.log](../fixtures/data/access.log), 46,216 B, sha256 6e4fa9285b3435ff5f1bb28938124737a0e39035a2f535003b69c46f9e5ff085. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-git-log

**Git log (150+ commits)**

**What you do:** Read 150 commits of a git log.

**Without Context Mode:** The whole tool output goes into the chat: 11,895 B, about 2,974 tokens.

It starts like this:

```text
f8a3b1c 2026-02-23 Mert Koseoglu feat: add user role management with audit logging
d7e2a0b 2026-02-23 Mert Koseoglu refactor: improve UserList component with skeleton loading
c6d1f9a 2026-02-23 Mert Koseoglu feat: add email magic link authentication
b5c0e8f 2026-02-22 Alice Johnson fix: resolve null updatedAt in user role mutation
a4b9d7e 2026-02-22 Alice Johnson test: add comprehensive billing router tests
93a8c6d 2026-02-22 Mert Koseoglu feat: add middleware route protection
82f7b5c 2026-02-22 Bob Martinez refactor: extract database transaction helper
71e6a4b 2026-02-22 Bob Martinez chore: update prisma schema with user tracking fields
```

First 8 of 153 lines.

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 107 B, about 27 tokens. That keeps 99.1% of it out of the chat.

```text
git — Log Summary
Commits: 153
By type: feat:57, fix:28, refactor:19, chore:17, test:15, perf:10, docs:7
```

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-git-log)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-git-log
```

<sub>Proof: input [fixtures/data/git-log.txt](../fixtures/data/git-log.txt), 11,895 B, sha256 d767dbdb990c98070c617a9c8d2263d267c596d3ecfcda4cc0a79743815e45ae. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-analytics

**Analytics CSV (500 rows)**

**What you do:** Read an analytics CSV file with 500 rows.

**Without Context Mode:** The whole tool output goes into the chat: 87,517 B, about 21,879 tokens.

It starts like this:

```text
id,timestamp,user_id,action,resource,duration_ms,status,ip,user_agent
1,2026-02-23T08:00:00Z,user_1,view,document,33,success,10.0.1.100,Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/ ...
2,2026-02-23T08:03:07Z,user_2,create,project,266,success,10.0.1.101,Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131. ...
3,2026-02-23T08:06:14Z,user_3,update,task,219,success,10.0.2.50,Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version ...
4,2026-02-23T08:09:21Z,user_4,delete,comment,102,success,10.0.2.51,Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0
5,2026-02-23T08:12:28Z,user_5,search,document,415,success,10.0.3.200,Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Saf ...
6,2026-02-23T08:15:35Z,user_6,export,project,1178,success,10.0.3.201,Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chro ...
7,2026-02-23T08:18:42Z,user_7,view,task,111,success,10.0.4.10,Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0  ...
```

First 8 of 501 lines. Lines over 160 characters are cut.

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 222 B, about 56 tokens. That keeps 99.7% of it out of the chat.

```text
analytics — CSV Summary
Events: 500 | Users: 50 | Avg latency: 3717ms
Actions: {'view': 150, 'update': 100, 'search': 100, 'create': 50, 'delete': 50, 'export': 50}
Statuses: {'success': 400, 'error': 50, 'timeout': 50}
```

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-analytics)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-analytics
```

<sub>Proof: input [fixtures/data/analytics.csv](../fixtures/data/analytics.csv), 87,517 B, sha256 6dae0fc8f09d26e767e58ab0ba2a53aaaa014ddc7a2027aa3ca2f80111a19e54. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-github-api-issues-large

**Large JSON payload (Next.js issues, 30 items)**

**What you do:** Fetch 30 open issues of vercel/next.js from the GitHub API.

**Without Context Mode:** The whole tool output goes into the chat: 219,175 B, about 54,794 tokens.

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

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 818 B, about 205 tokens. That keeps 99.6% of it out of the chat.

```text
issues: 30 | keys per item: 33
top labels: Turbopack x12, created-by: Turbopack team x11, tests x11, type: next x6, Documentation x3
#101008 open comments=1 turbo-tasks: add lazy cell reads via LazyReadRef
#101007 open comments=0 docs: note that og:url is not derived from alternates.canonical
#101006 open comments=0 docs: correct the use cache prerender timeout and its error message
#101005 open comments=0 docs: say which value wins when cacheLife runs more than once
#101004 open comments=0 fix: exclude non-prefetchable cache entries from RDC
#101003 open comments=1 [no-unsafe-inline] Test streaming without framework JavaScript
#101001 open comments=1 feat(turbopack): Add EmitOption trait for extensible chunking context configurat
#100997 open comments=1 [ci] Use latest Node.js in future compatibility mode
```

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-github-api-issues-large)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-github-api-issues-large
```

<sub>Proof: input [fixtures/data/github-api-issues-large.json](../fixtures/data/github-api-issues-large.json), 219,175 B, sha256 bd2bdb943de007b7bb57d4e4a53a01ad801cf57606a3228682b39d05eb8a5e16. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-npm-install-log

**npm install log (--loglevel http)**

**What you do:** Install packages with npm and read the log.

**Without Context Mode:** The whole tool output goes into the chat: 37,761 B, about 9,440 tokens.

It starts like this:

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

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 435 B, about 109 tokens. That keeps 98.8% of it out of the chat.

```text
lines: 398 | GET: 258 | cache miss: 257 | non-200: 0
slowest:
  4644ms https://registry.npmjs.org/@esbuild/darwin-arm64/-/darwin-arm64-0.24.0.tgz
  2771ms https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz
  2200ms https://registry.npmjs.org/zod/-/zod-4.6.7.tgz
  2065ms https://registry.npmjs.org/@modelcontextprotocol/server/-/server-2.3.1.tgz
  2034ms https://registry.npmjs.org/@modelcontextprotocol/sdk/-/sdk-1.32.2.tgz
```

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-npm-install-log)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-npm-install-log
```

<sub>Proof: input [fixtures/data/npm-install-log.txt](../fixtures/data/npm-install-log.txt), 37,761 B, sha256 54fe053a4c8ece97a96bef23b019a9120a230af1e17eddd70d4a046dd48a9af0. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-source-big

**Big source file (constants.ts, 61 KB)**

**What you do:** Read a 61 KB TypeScript source file.

**Without Context Mode:** The whole tool output goes into the chat: 61,576 B, about 15,394 tokens.

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

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 473 B, about 118 tokens. That keeps 99.2% of it out of the chat.

```text
lines: 727 | exports: 455
first 25: SERVER_KEY, TOOL_ORDER, prefixToolNames, OUTPUT_CAP, STATE_BUDGET, RESUME_CAP, REPORT_CAP, POINTER_MIN, STATE_CLOSE_TAG, INDEX_WRITE_CHUNK, SYNC_INDEX_MAX_BYTES, REPLACE_TRIGGER_BYTES, REPLA ...
```

Lines over 200 characters are cut.

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-source-big)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-source-big
```

<sub>Proof: input [fixtures/data/source-big.ts](../fixtures/data/source-big.ts), 61,576 B, sha256 7b4ba6812418434b9c682875de2454668ed98f3e0791f9e2b528ac034ec6e725. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-git-log-large

**Git log (2000 commits)**

**What you do:** Read 2,000 commits of a git log.

**Without Context Mode:** The whole tool output goes into the chat: 191,120 B, about 47,780 tokens.

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

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 137 B, about 34 tokens. That keeps 99.9% of it out of the chat.

```text
commits: 2000 | by month: {"2026-10":2000}
top prefixes: impl 471, docs 434, review 257, test 223, fix 187, bench 141, feat 64, merge 42
```

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-git-log-large)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-git-log-large
```

<sub>Proof: input [fixtures/data/git-log-large.txt](../fixtures/data/git-log-large.txt), 191,120 B, sha256 028317819bc1a93fcfbeeba2d5ffea829fe4c439e3889d688f76fbb11bb913ad. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-devtools-mcp-snapshot

**Browser snapshot (take_snapshot, Wikipedia SQLite page)**

**What you do:** Take a snapshot of the Wikipedia SQLite page with Chrome DevTools MCP.

**Without Context Mode:** The whole tool output goes into the chat: 136,514 B, about 34,129 tokens.

It starts like this:

```text
## Latest page snapshot
uid=1_0 RootWebArea "SQLite - Wikipedia" url="https://en.wikipedia.org/wiki/SQLite"
  uid=1_1 generic live="polite" relevant="additions text"
  uid=1_2 link "Jump to content" url="https://en.wikipedia.org/wiki/SQLite#bodyContent"
  uid=1_4 banner
    uid=1_5 navigation "Site"
      uid=1_6 button "Main menu" haspopup="menu"
    uid=1_7 link "Wikipedia The Free Encyclopedia" url="https://en.wikipedia.org/wiki/Main_Page"
```

First 8 of 1,781 lines.

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 463 B, about 116 tokens. That keeps 99.7% of it out of the chat.

```text
lines: 1781 | links: 616 | root: uid=1_0 RootWebArea "SQLite - Wikipedia" url="https://en.wikipedia.org/wiki/SQLite"
roles: link 616, " 315, ". 186, "." 80, generic 73, ", 20, heading 19, " " 18
headings: uid=1_22 heading "Contents" level="2" | uid=1_63 heading "SQLite" level="1" | uid=1_397 heading "History" level="2" | uid=1_493 heading "Design" level="2" | uid=1_625 heading "Features" leve ...
```

Lines over 200 characters are cut.

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-devtools-mcp-snapshot)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-devtools-mcp-snapshot
```

<sub>Proof: input [fixtures/data/devtools-mcp-snapshot.txt](../fixtures/data/devtools-mcp-snapshot.txt), 136,514 B, sha256 93903f7b076c2086f45b487395eb4a72f99f1820d146dbb1d822108a275fd259. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-gh-issue-list-vite

**GitHub issues (gh issue list --json, vitejs/vite, 40 items)**

**What you do:** List 40 open issues of vitejs/vite with gh.

**Without Context Mode:** The whole tool output goes into the chat: 182,943 B, about 45,736 tokens.

It starts like this:

```text
[{"author":{"id":"U_kgDOBnucyw","is_bot":false,"login":"materwelonDhruv","name":"Dhruv"},"body":"### Describe the bug\n\nMy CLI runs Vite through the JS API and prints `error.message` when something fails (stacks only show with `--verbose`). When a user's plugin throws in its `config` hook, all they get is the plugin's own message, like ``missing required option `apiKey` ``, with nothing saying which plugin it came from. The stack doesn't help either. The top frame is just `B ...
```

The output is one line of 182,943 B. These are its first 480 characters.

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 850 B, about 213 tokens. That keeps 99.5% of it out of the chat.

```text
issues: 40 | oldest: 2026-09-29T06:59:34Z | body bytes: 139807
top labels: pending triage x12, p2-edge-case x3, feat: bundled-dev x2, feat: dev x2, p2-nice-to-have x2
#23958 OPEN Errors thrown in `config`, `configResolved`, `configureServer` or a dev server's
#23955 OPEN Allow for `lightningcss-wasm` support
#23946 OPEN Dep optimizer resolves a pre-bundled package's #subpath imports without resolve.
#23945 OPEN Vite drops css chunks in output when not using dynamic imports
#23943 OPEN Version dev modules with a per-module counter that moves only when content chang
#23942 OPEN After an HMR update, a module above a self-accepting boundary runs a second time
#23941 OPEN `reloadModule()` during an in-flight transform serves and caches the previous co
#23940 OPEN Dev server on macOS adds a new FSEvents watch listener for an out-of-root file o
```

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-gh-issue-list-vite)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-gh-issue-list-vite
```

<sub>Proof: input [fixtures/data/gh-issue-list-vite.json](../fixtures/data/gh-issue-list-vite.json), 182,943 B, sha256 05eca692a67494a13e1d9025c5b2f3a767897dd5ca0ed9bb5b540520523a8201. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-gh-pr-list-vite

**GitHub pull requests with checks (gh pr list --json, vitejs/vite, 25 items)**

**What you do:** List 25 open pull requests of vitejs/vite with their CI checks.

**Without Context Mode:** The whole tool output goes into the chat: 195,471 B, about 48,868 tokens.

It starts like this:

```text
[{"additions":100,"author":{"id":"U_kgDOB13F0g","is_bot":false,"login":"Arham-Begani","name":"Arham Begani"},"body":"Imports such as data.json?url should return a URL; data.json?raw should return the file’s text. Tests cover both ES modules and CommonJS. 36 related tests pass, alongside build, type, lint and formatting checks and bro The dependency optimizer mishandled those suffixes, codex helped close the gaps efficeiently\n\ni reviews the code, saw the tests and when i saw ...
```

The output is one line of 195,471 B. These are its first 480 characters.

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 776 B, about 194 tokens. That keeps 99.6% of it out of the chat.

```text
prs: 25 | additions: 2080 | deletions: 81 | files: 109
checks: {"SKIPPED":99,"SUCCESS":326,"FAILURE":29,"NEUTRAL":54}
#23962 +100/-2 fix(optimizer): preserve explicit asset queries in dependencies (fix #20285)
#23961 +120/-1 feat(css): fall back to `lightningcss-wasm` when the native package can't be loa
#23959 +40/-1 fix(optimizer): resolve subpath imports (#) with Vite's resolver
#23957 +234/-3 fix(hmr): preserve importer identity above boundaries (fix #23942)
#23956 +37/-7 fix(worker): keep nested workers still used by a live worker
#23954 +2/-2 docs: fix ViteConf tag hover resize loop (fix #23905)
#23950 +58/-1 fix(hmr): invalidate module in `reloadModule` to discard in-flight transforms (f
#23947 +1/-1 docs: clarify configLoader for monorepo TypeScript imports
```

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-gh-pr-list-vite)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-gh-pr-list-vite
```

<sub>Proof: input [fixtures/data/gh-pr-list-vite.json](../fixtures/data/gh-pr-list-vite.json), 195,471 B, sha256 8cdc8086bc300aa2148977f0ef93ddd5ead40b4d33f8d1756673cbbf66a56879. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-context7-query-docs-vite

**Library docs (query-docs, vite build and proxy config)**

**What you do:** Look up the Vite build and proxy docs through Context7.

**Without Context Mode:** The whole tool output goes into the chat: 6,917 B, about 1,729 tokens.

It starts like this:

````text
### Configure server.proxy rules

Source: https://github.com/vitejs/vite/blob/main/docs/config/server-options.md

Configure proxy rules using string shorthand, custom target options, regular expressions, proxy instance configuration, or WebSocket proxying. Requests matching ...

```javascript
export default defineConfig({
````

First 8 of 197 lines. Lines over 160 characters are cut.

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 473 B, about 118 tokens. That keeps 93.2% of it out of the chat.

```text
sections: 5 | code fences: 4
- Configure server.proxy rules <- vitejs/vite/blob/main/docs/config/server-options.md
- Dev server /api proxy configuration <- vitejs/vite/blob/main/docs/config/server-options.md
- Configuring plugins in vite.config.js <- vitejs/vite/blob/main/docs/guide/api-plugin.md
- Proxy API requests to a separate backend server <- vitejs/vite/blob/main/docs/config/server-options.md
- server.proxy <- vitejs/vite/blob/main/docs/config/server-options.md
```

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-context7-query-docs-vite)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-context7-query-docs-vite
```

<sub>Proof: input [fixtures/data/context7-query-docs-vite.txt](../fixtures/data/context7-query-docs-vite.txt), 6,917 B, sha256 576bc7940657b02bb38d8a1ace44e713cdb1e54059b832ef050e24863024b4f2. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-vitest-run-vite

**Test run, 1106 tests, 25 failing (vitest run --reporter=verbose, vitejs/vite)**

**What you do:** Run the 1,106 Vitest tests of vitejs/vite (25 of them fail).

**Without Context Mode:** The whole tool output goes into the chat: 62,909 B, about 15,727 tokens.

It starts like this:

```text

 RUN  v5.0.5 /work/vite

 ❯ packages/create-vite/__tests__/cli.spec.ts (25 tests | 25 failed) 1138ms
   × prompts for the project name if none supplied 44ms
   × prompts for the framework if none supplied when target dir is current directory 46ms
   × prompts for the framework if none supplied 42ms
   × prompts for the framework on not supplying a value for --template 38ms
```

First 8 of 1,075 lines.

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 429 B, about 107 tokens. That keeps 99.3% of it out of the chat.

```text
Test Files  1 failed | 73 passed (74)
Tests  25 failed | 1078 passed | 3 skipped (1106)
Duration  1.99s (tests 70%, import 18%, transform 11%)
failing files: {" packages/create-vite/__tests__/cli.spec.ts":25}
first failure:  FAIL  packages/create-vite/__tests__/cli.spec.ts > prompts for the project name if none supplied
cause: ExecaSyncError: Command failed with exit code 1: node /work/vite/packages/create-vite --interactive
```

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-vitest-run-vite)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-vitest-run-vite
```

<sub>Proof: input [fixtures/data/vitest-run-vite.txt](../fixtures/data/vitest-run-vite.txt), 62,909 B, sha256 d089c367e8ef502da66114fdf07ab6452aa3a080917f870c18a36baadc62fd41. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-biome-lint-vite

**Lint report as JSON (biome lint --reporter=json, packages/vite/src)**

**What you do:** Lint the vitejs/vite source with Biome.

**Without Context Mode:** The whole tool output goes into the chat: 288,523 B, about 72,131 tokens.

It starts like this:

```text
{"summary":{"changed":0,"unchanged":542,"matches":0,"duration":98621916,"errors":118,"warnings":826,"infos":119,"skipped":0,"suggestedFixesSkipped":0,"diagnosticsNotPrinted":0,"scannerDuration":12720625},"diagnostics":[{"severity":"info","message":"Template literals are preferred over string concatenation.","category":"lint/style/useTemplate","location":{"path":"packages/vite/src/client/client.ts","start":{"line":616,"column":50},"end":{"line":616,"column":71}},"advices":[]}, ...
```

The output is one line of 288,523 B. These are its first 480 characters.

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 577 B, about 144 tokens. That keeps 99.8% of it out of the chat.

```text
summary: {"errors":118,"warnings":826,"infos":119,"files":542} | diagnostics: 1063
top rules: lint/style/noNonNullAssertion 359, lint/suspicious/noExplicitAny 325, lint/style/useTemplate 103, lint/suspicious/noAssignInExpressions 52, lint/suspicious/useIterableCallbackReturn 28, lin ...
top files: packages/vite/src/node/plugins/css.ts 67, packages/vite/src/node/__tests__/config.spec.ts 51, packages/vite/src/node/utils.ts 48, packages/vite/src/node/plugins/html.ts 45
```

Lines over 200 characters are cut.

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-biome-lint-vite)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-biome-lint-vite
```

<sub>Proof: input [fixtures/data/biome-lint-vite.json](../fixtures/data/biome-lint-vite.json), 288,523 B, sha256 50a1b9134671cf9311edb8bcad99b2caacea444d5ef7419788fc97b5b6e002af. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-pnpm-install-vite

**Workspace install log (pnpm install --frozen-lockfile, vitejs/vite)**

**What you do:** Install the vitejs/vite workspace with pnpm.

**Without Context Mode:** The whole tool output goes into the chat: 14,988 B, about 3,747 tokens.

It starts like this:

```text
Scope: all 294 workspace projects
[WARN] The settings in packages/vite/src/node/server/__tests__/fixtures/pnpm/pnpm-workspace.yaml do not apply, because packages/vite/src/node/server/__tests__/f ...
? Verifying lockfile against supply-chain policies (1330 entries)...
Packages are hard linked from the content-addressable store to the virtual store.
  Content-addressable store is at: /home/user/Library/pnpm/store/v11
  Virtual store is at:             node_modules/.pnpm
Update available! 12.15.0 → 12.16.1.
Changelog: https://pnpm.io/v/12.16.1
```

First 8 of 175 lines. Lines over 160 characters are cut.

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 199 B, about 50 tokens. That keeps 98.7% of it out of the chat.

```text
lines: 173 | progress lines: 25 | warnings: 40
last progress: Progress: resolved 1080, reused 0, downloaded 958, added 1080, done
tail: + vitest 5.0.5 | Done in 2m 25.1s using pnpm v12.15.0 | exit 0
```

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-pnpm-install-vite)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-pnpm-install-vite
```

<sub>Proof: input [fixtures/data/pnpm-install-vite.txt](../fixtures/data/pnpm-install-vite.txt), 14,988 B, sha256 50fdc94bb8c081bf8ecc56b73b679cf82dbee3b7bba50bc7b6f25a4c47ef42dd. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-docker-logs-mongo

**Container logs (docker logs, mongo:8.0 --verbose)**

**What you do:** Read the logs of a MongoDB container.

**Without Context Mode:** The whole tool output goes into the chat: 60,374 B, about 15,094 tokens.

It starts like this:

```text
{"t":{"$date":"2026-11-01T08:16:38.321+00:00"},"s":"I",  "c":"CONTROL",  "id":23285,   "ctx":"main","msg":"Automatically disabling TLS 1.0, to force-enable TLS  ...
{"t":{"$date":"2026-11-01T08:16:38.323+00:00"},"s":"I",  "c":"CONTROL",  "id":5945603, "ctx":"main","msg":"Multi threading initialized"}
{"t":{"$date":"2026-11-01T08:16:38.325+00:00"},"s":"I",  "c":"NETWORK",  "id":4648601, "ctx":"main","msg":"Implicit TCP FastOpen unavailable. If TCP FastOpen is ...
{"t":{"$date":"2026-11-01T08:16:38.325+00:00"},"s":"I",  "c":"NETWORK",  "id":4915701, "ctx":"main","msg":"Initialized wire specification","attr":{"spec":{"inco ...
{"t":{"$date":"2026-11-01T08:16:38.327+00:00"},"s":"I",  "c":"TENANT_M", "id":7091600, "ctx":"main","msg":"Starting TenantMigrationAccessBlockerRegistry"}
{"t":{"$date":"2026-11-01T08:16:38.327+00:00"},"s":"I",  "c":"CONTROL",  "id":4615611, "ctx":"initandlisten","msg":"MongoDB starting","attr":{"pid":1,"port":270 ...
{"t":{"$date":"2026-11-01T08:16:38.327+00:00"},"s":"I",  "c":"CONTROL",  "id":23403,   "ctx":"initandlisten","msg":"Build Info","attr":{"buildInfo":{"version":" ...
{"t":{"$date":"2026-11-01T08:16:38.328+00:00"},"s":"I",  "c":"CONTROL",  "id":51765,   "ctx":"initandlisten","msg":"Operating System","attr":{"os":{"name":"Ubun ...
```

First 8 of 174 lines. Lines over 160 characters are cut.

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 587 B, about 147 tokens. That keeps 99.0% of it out of the chat.

```text
entries: 174 | severity: {"I":109,"D1":55,"W":10}
components: WTWRTLOG 49, STORAGE 40, CONTROL 18, NETWORK 11, WTCHKPT 11, COMMAND 11
W NETWORK Overriding max connections to honor `capMemoryConsumptionForPreAuthBuffers` settings
W CONTROL Access control is not enabled for the database. Read and write access to data and configur
W CONTROL For customers running the current memory allocator, we suggest changing the contents of th
W CONTROL We suggest setting the contents of sysfsFile to 0.
W CONTROL We suggest setting swappiness to 0 or 1, as swapping can cause performance problems.
```

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-docker-logs-mongo)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-docker-logs-mongo
```

<sub>Proof: input [fixtures/data/docker-logs-mongo.txt](../fixtures/data/docker-logs-mongo.txt), 60,374 B, sha256 d4810c22ef63d6cc27d933e0fd89163ad3fb313f957ed8b907a1eeaae5ae9d1a. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-terraform-plan

**Plan output (terraform plan, 72 resources)**

**What you do:** Plan 72 new resources with Terraform.

**Without Context Mode:** The whole tool output goes into the chat: 34,081 B, about 8,520 tokens.

It starts like this:

```text

Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  + create

Terraform will perform the following actions:

  # local_file.config["api-dev"] will be created
```

First 8 of 1,045 lines.

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 166 B, about 42 tokens. That keeps 99.5% of it out of the chat.

```text
Plan: 72 to add, 0 to change, 0 to destroy.
to create by type: {"local_file":24,"random_password":24,"random_pet":24} | unknown after apply: 240
sensitive values: 48
```

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-terraform-plan)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-terraform-plan
```

<sub>Proof: input [fixtures/data/terraform-plan.txt](../fixtures/data/terraform-plan.txt), 34,081 B, sha256 127d2218bf3fdeaec6514bb6a9cf4f1011e717e3dc434f7c959a683b629d56f4. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## a-git-log-stat-vite

**Commit history with file stats (git log --stat, 300 commits, vitejs/vite)**

**What you do:** Read 300 commits of vitejs/vite with file stats.

**Without Context Mode:** The whole tool output goes into the chat: 164,385 B, about 41,096 tokens.

It starts like this:

```text
commit 90bc034a97e7eccd0f3cbc69904fffa625a4c34d
Author: 翠
Date: 2026-10-30 19:47:43 +0900

    fix: use top-level `input` for SSR build when `build.ssr: true` (#23898)


 packages/vite/src/node/__tests__/config.spec.ts | 24 ++++++++++++++++++++++++
```

First 8 of 4,019 lines.

**With Context Mode:** A short script reads the output in a sandbox. The agent gets only what the script prints. The agent gets 268 B, about 67 tokens. That keeps 99.8% of it out of the chat.

```text
commits: 300 | authors: 76 | from 2026-08-07 to 2026-10-30
most touched: packages/vite/src 328, .../vite/src 60, packages/create-vite/src 23, pnpm-lock.yaml                                     22, .../src/node 21, package.json                                  ...
```

Lines over 200 characters are cut.

**Tool:** ctx_execute. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=a-git-log-stat-vite)

**Rerun it yourself:**

```sh
cd bench && node run.mjs a-git-log-stat-vite
```

<sub>Proof: input [fixtures/data/git-log-stat-vite.txt](../fixtures/data/git-log-stat-vite.txt), 164,385 B, sha256 b520fe995fbf968ee726fc1a8eb1bca799b1e2d3a6f1230b4f218dcf86122f36. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>
