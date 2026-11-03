# B. Knowledge retrieval (ctx_index + ctx_search)

Each case here is a document the agent needs a few answers from: library docs, a skill file, a tool list, a docs page.  
Without Context Mode the whole document goes into the chat. With Context Mode it goes into a local search index.  
The agent asks its questions and gets back only the parts that match.

Run this group: `cd bench && node run.mjs b-retrieval`. All tables: [results/2026-11-01-darwin-arm64.md](../results/2026-11-01-darwin-arm64.md).

## b-supabase-edge-functions-5-examples

**Supabase Edge Functions (5 examples)**

**What you do:** Find answers in 5 Supabase Edge Functions examples.

**Without Context Mode:** The whole document goes into the chat: 3,988 B, about 997 tokens.

It starts like this:

````text
### Deno Unit Test Example for Supabase Edge Functions

Source: https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/functions/unit-test.mdx

This TypeScript example demonstrates a unit test for Supabase Edge Functions using Deno. It shows how to initialize a Supabase client with environment variables ...

```typescript
import { assert, assertEquals } from 'jsr:@std/assert@1'
````

First 8 of 101 lines. Lines over 160 characters are cut.

**With Context Mode:** The document goes into a local search index. The agent asks 3 questions and gets back only the parts that match (3 of 3 questions got a hit). The agent gets 3,493 B, about 873 tokens. That keeps 12.4% of it out of the chat.

````text
Query "CORS handling edge function":
Context7: Supabase #4: ### Supabase Edge Functions - Serverless Drivers

Supabase Edge Functions use the Deno runtime which has native support for TCP connections, providing flexibility in choosing your database client. You can use supabase-js, Deno Postgres driver, Postgr ...
Query "database connection Deno Postgres":
Context7: Supabase #1: ### Connect to Supabase Postgres with supabase-js in Deno Edge Function

Source: https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/functions/connect-to-postgres.mdx

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2'
````

First 12 of 72 lines. Lines over 200 characters are cut.

**Tool:** ctx_index + ctx_search. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=b-supabase-edge-functions-5-examples)

**Rerun it yourself:**

```sh
cd bench && node run.mjs b-supabase-edge-functions-5-examples
```

<sub>Proof: input [fixtures/data/context7-supabase-edge.md](../fixtures/data/context7-supabase-edge.md), 3,988 B, sha256 c2baf87451f27eaf7737a2319f01577c577893c72479f70e656b86c8e47f610d. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## b-react-useeffect-docs

**React useEffect docs**

**What you do:** Find answers in the React useEffect docs.

**Without Context Mode:** The whole document goes into the chat: 6,075 B, about 1,519 tokens.

It starts like this:

````text
### useEffect Hook Reference

Source: https://react.dev/reference/react/useEffect

The useEffect Hook allows you to declare side effects in functional components. It accepts a setup function and optional dependencies array, running the setup a ...

```APIDOC
## useEffect Hook
````

First 8 of 161 lines. Lines over 160 characters are cut.

**With Context Mode:** The document goes into a local search index. The agent asks 3 questions and gets back only the parts that match (3 of 3 questions got a hit). The agent gets 3,356 B, about 839 tokens. That keeps 44.8% of it out of the chat.

````text
Query "useEffect cleanup function":
Context7: React #0: ### useEffect Hook Reference

Source: https://react.dev/reference/react/useEffect

The useEffect Hook allows you to declare side effects in functional components. It accepts a setup function and optional dependencies array, running the setup after component commits and cleanup befor ...

```APIDOC
## useEffect Hook

### Description
A React Hook that synchronizes a component with an external system by running side effects after render commits.
````

First 12 of 89 lines. Lines over 200 characters are cut.

**Tool:** ctx_index + ctx_search. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=b-react-useeffect-docs)

**Rerun it yourself:**

```sh
cd bench && node run.mjs b-react-useeffect-docs
```

<sub>Proof: input [fixtures/data/context7-react-docs.md](../fixtures/data/context7-react-docs.md), 6,075 B, sha256 c0ee0d81f97dd86973cb8355a37ffa58eb1a3efad82371e2128ccdd75c9f3d4f. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## b-next-js-app-router-docs

**Next.js App Router docs**

**What you do:** Find answers in the Next.js App Router docs.

**Without Context Mode:** The whole document goes into the chat: 6,658 B, about 1,665 tokens.

It starts like this:

````text
### Create Server Component Page with Data Fetching in Next.js App Directory

Source: https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/migrating/app-router-migration.mdx

Shows how to create a new page.tsx file in the app directory that acts as a Server Component by default. This component imports the Client Component and handles ...

```typescript
// Import your Client Component
````

First 8 of 223 lines. Lines over 160 characters are cut.

**With Context Mode:** The document goes into a local search index. The agent asks 3 questions and gets back only the parts that match (3 of 3 questions got a hit). The agent gets 4,463 B, about 1,116 tokens. That keeps 33.0% of it out of the chat.

````text
Query "App Router data fetching":
Context7: Next.js #0: ### Create Server Component Page with Data Fetching in Next.js App Directory

Source: https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/migrating/app-router-migration.mdx

Shows how to create a new page.tsx file in the app directory that acts as a Server Component by default. This component imports the Client Component and handles data fetching using the new data fetchi ...

```typescript
// Import your Client Component
import HomePage from './home-page'

async function getPosts() {
````

First 12 of 157 lines. Lines over 200 characters are cut.

**Tool:** ctx_index + ctx_search. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=b-next-js-app-router-docs)

**Rerun it yourself:**

```sh
cd bench && node run.mjs b-next-js-app-router-docs
```

<sub>Proof: input [fixtures/data/context7-nextjs-docs.md](../fixtures/data/context7-nextjs-docs.md), 6,658 B, sha256 b687675406d856b451d05ccb702c345a47849969295d19b2b21d2fede213620b. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## b-tailwind-css-docs

**Tailwind CSS docs**

**What you do:** Find answers in the Tailwind CSS docs.

**Without Context Mode:** The whole document goes into the chat: 4,102 B, about 1,026 tokens.

It starts like this:

````text
### Apply responsive flex layout with Tailwind CSS

Source: https://github.com/tailwindlabs/tailwindcss.com/blob/main/src/docs/responsive-design.mdx

Demonstrates how to create a responsive layout that switches from block display on mobile to flex display on medium screens and larger. Uses md:flex to enable f ...

```html
<div class="md:flex">
````

First 8 of 87 lines. Lines over 160 characters are cut.

**With Context Mode:** The document goes into a local search index. The agent asks 2 questions and gets back only the parts that match (2 of 2 questions got a hit). The agent gets 1,429 B, about 357 tokens. That keeps 65.2% of it out of the chat.

````text
Query "responsive breakpoints":
Context7: Tailwind #1: ### Create responsive grid layouts with breakpoint variants

Source: https://github.com/tailwindlabs/tailwindcss.com/blob/main/src/docs/hover-focus-and-other-states.mdx

Use Tailwind's responsive variants (md, lg, etc.) to apply different grid column counts at specific viewport breakpoints. This example renders a 3-column grid on mobile, 4 columns on medium screens, a ...

```html
<div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
  <!-- ... -->
</div>
```
````

First 12 of 29 lines. Lines over 200 characters are cut.

**Tool:** ctx_index + ctx_search. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=b-tailwind-css-docs)

**Rerun it yourself:**

```sh
cd bench && node run.mjs b-tailwind-css-docs
```

<sub>Proof: input [fixtures/data/context7-tailwind-docs.md](../fixtures/data/context7-tailwind-docs.md), 4,102 B, sha256 d0307fa05b356fbd45451317ffeb324dcbf959577772a9da0b7c87d9c98d7a02. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## b-skill-context-mode-main-prompt

**Skill: context-mode (main prompt)**

**What you do:** Find answers in the context-mode skill prompt.

**Without Context Mode:** The whole document goes into the chat: 16,683 B, about 4,171 tokens.

It starts like this:

```text
---
name: context-mode
description: |
  Use context-mode tools (ctx_execute, ctx_execute_file) instead of Bash/cat when processing
  large outputs. Triggers: "analyze logs", "summarize output", "process data",
  "parse JSON", "filter results", "extract errors", "check build output",
  "analyze dependencies", "process API response", "large file analysis",
  "page snapshot", "browser snapshot", "DOM structure", "inspect page",
```

First 8 of 300 lines.

**With Context Mode:** The document goes into a local search index. The agent asks 3 questions and gets back only the parts that match (3 of 3 questions got a hit). The agent gets 4,496 B, about 1,124 tokens. That keeps 73.1% of it out of the chat.

````text
Query "when to use execute vs execute_file":
Skill: context-mode #3: ```
│   └── Use Bash
│
├── Output MIGHT be large or you're UNSURE?
│   └── Use context-mode ctx_execute or ctx_execute_file
│
├── Fetching web documentation or HTML page?
│   └── Use ctx_fetch_and_index → ctx_search
│
├── Using Playwright (navigate, snapshot, console, network)?
│   └── ALWAYS use filename parameter to save to file, then:
````

First 12 of 83 lines.

**Tool:** ctx_index + ctx_search. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=b-skill-context-mode-main-prompt)

**Rerun it yourself:**

```sh
cd bench && node run.mjs b-skill-context-mode-main-prompt
```

<sub>Proof: input [fixtures/data/skills/skill-main.md](../fixtures/data/skills/skill-main.md), 16,683 B, sha256 ce26cb01de7a116eab256f916620935f029e850771f3fb6cb7d40a3ce8d1f7ff. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## b-skill-references-4-files-combined

**Skill references (4 files combined)**

**What you do:** Find answers in 4 skill reference files.

**Without Context Mode:** The whole document goes into the chat: 36,090 B, about 9,023 tokens.

The first of the 4 inputs starts like this:

```text
# JavaScript / TypeScript Patterns for execute

Practical patterns for using `execute` with `language: javascript`.
All examples assume Node.js runtime with native fetch (Node 18+).

---

## API Response Processing
```

First 8 of 298 lines.

**With Context Mode:** The document goes into a local search index. The agent asks 3 questions and gets back only the parts that match (3 of 3 questions got a hit). The agent gets 8,212 B, about 2,053 tokens. That keeps 77.2% of it out of the chat.

````text
Query "JSON parse transform pattern":
Skill Refs: context-mode #45: ## 3. Using Bash When JS/Python Would Be Cleaner

**Problem:** Complex data processing in Bash quickly becomes unreadable and error-prone.

```shell
# BAD — parsing JSON in Bash is fragile:
cat data.json | python3 -c "
import sys, json
data = json.load(sys.stdin)
for item in data:
    if item['status'] == 'error':
````

First 12 of 250 lines.

**Tool:** ctx_index + ctx_search. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=b-skill-references-4-files-combined)

**Rerun it yourself:**

```sh
cd bench && node run.mjs b-skill-references-4-files-combined
```

<sub>Proof: input [fixtures/data/skills/patterns-javascript.md](../fixtures/data/skills/patterns-javascript.md), 9,598 B, sha256 e0e6e6d17d2df8d93cff0922fb42b21382328d3d14a9bc32f62f0b3f127fc723; input [fixtures/data/skills/patterns-python.md](../fixtures/data/skills/patterns-python.md), 9,282 B, sha256 8d76144c9e812a54c884b815f526fea85179839fcc70b205bfde1e757ae95fec; input [fixtures/data/skills/patterns-shell.md](../fixtures/data/skills/patterns-shell.md), 6,814 B, sha256 34be33127c296b273e03cf1d8c373c57083e160a1a2ac3876dca010c74689877; input [fixtures/data/skills/anti-patterns.md](../fixtures/data/skills/anti-patterns.md), 10,368 B, sha256 fd6112a5d73375ff2bb3029479766b9927cab48db982fa2a3019682c1c8a3a7d. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## b-mcp-tools-list-40-tools

**MCP tools/list (40 tools)**

**What you do:** Find the right tool in a list of 40 MCP tools.

**Without Context Mode:** The whole document goes into the chat: 2,509 B, about 627 tokens.

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

**With Context Mode:** The document goes into a local search index. The agent asks 3 questions and gets back only the parts that match (3 of 3 questions got a hit). The agent gets 1,153 B, about 288 tokens. That keeps 54.0% of it out of the chat.

```text
Query "browser screenshot tool":
MCP: tools/list #26: ### take_screenshot

Take a screenshot of a web page

---
MCP: tools/list #25: ### open_browser

Open a URL in the browser for testing

---
Query "file search glob":
```

First 12 of 64 lines.

**Tool:** ctx_index + ctx_search. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=b-mcp-tools-list-40-tools)

**Rerun it yourself:**

```sh
cd bench && node run.mjs b-mcp-tools-list-40-tools
```

<sub>Proof: input [fixtures/data/mcp-tools.json](../fixtures/data/mcp-tools.json), 17,362 B, sha256 290dac23e92d735bfc532c6e757df79725217e4871326cdffcb878c0ada973ef. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>

## b-html-docs-page-sqlite-org-fts5-215-kb

**HTML docs page (sqlite.org FTS5, 215 KB)**

**What you do:** Find answers in the 215 KB SQLite FTS5 docs page.

**Without Context Mode:** The whole document goes into the chat: 215,354 B, about 53,839 tokens.

It starts like this:

```text
<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="content-type" content="text/html; charset=UTF-8">
<link href="sqlite.css" rel="stylesheet">
<title>SQLite FTS5 Extension</title>
<!-- path= -->
</head>
```

First 8 of 4,332 lines.

**With Context Mode:** The document goes into a local search index. The agent asks 3 questions and gets back only the parts that match (3 of 3 questions got a hit). The agent gets 14,188 B, about 3,547 tokens. That keeps 93.4% of it out of the chat.

````text
Query "bm25 ranking function weights":
data/sqlite-fts5-docs.html #42: ```
-- The following queries are logically equivalent. But the second may
-- be faster, particularly if the caller abandons the query before
-- all rows have been returned (or if the queries were modified to
-- include LIMIT clauses).
SELECT * FROM ft WHERE ft MATCH ? ORDER BY bm25(ft);
SELECT * FROM ft WHERE ft MATCH ? ORDER BY rank;
```

Instead of using bm25() with no trailing arguments, the specific auxiliary function mapped to the rank column may be configured either on a per-query basis, or by setting a different persistent defaul ...
````

First 12 of 210 lines. Lines over 200 characters are cut.

**Tool:** ctx_index + ctx_search. [How it works](https://contextmode.ai/docs/engine/tools?utm_source=github&utm_medium=bench&utm_content=b-html-docs-page-sqlite-org-fts5-215-kb)

**Rerun it yourself:**

```sh
cd bench && node run.mjs b-html-docs-page-sqlite-org-fts5-215-kb
```

<sub>Proof: input [fixtures/data/sqlite-fts5-docs.html](../fixtures/data/sqlite-fts5-docs.html), 215,354 B, sha256 de3092630358518a6869bf047055b3938e18b476e3fbc54f4e2146d1e593497f. Numbers: median of 5 runs in [results/2026-11-01-darwin-arm64.json](../results/2026-11-01-darwin-arm64.json).</sub>
