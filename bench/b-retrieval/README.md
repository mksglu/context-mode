# B. Knowledge retrieval (ctx_index + ctx_search)

The document goes into the FTS5 store; the agent asks fixed queries and gets the best chunks back. Native = the whole document entering the context. ctx_fetch_and_index is not run: it needs the network and the suite is offline. The same index path serves it (the page body is indexed the same way).

Run this group: `cd bench && node run.mjs b-retrieval`. Latest tables: [results/2026-11-01-darwin-arm64.md](../results/2026-11-01-darwin-arm64.md).

## b-supabase-edge-functions-5-examples

Supabase Edge Functions (5 examples)

- Command: `node run.mjs b-supabase-edge-functions-5-examples`
- Input: `fixtures/data/context7-supabase-edge.md`, 3988 B, sha256 c2baf87451f27eaf7737a2319f01577c577893c72479f70e656b86c8e47f610d

## b-react-useeffect-docs

React useEffect docs

- Command: `node run.mjs b-react-useeffect-docs`
- Input: `fixtures/data/context7-react-docs.md`, 6075 B, sha256 c0ee0d81f97dd86973cb8355a37ffa58eb1a3efad82371e2128ccdd75c9f3d4f

## b-next-js-app-router-docs

Next.js App Router docs

- Command: `node run.mjs b-next-js-app-router-docs`
- Input: `fixtures/data/context7-nextjs-docs.md`, 6658 B, sha256 b687675406d856b451d05ccb702c345a47849969295d19b2b21d2fede213620b

## b-tailwind-css-docs

Tailwind CSS docs

- Command: `node run.mjs b-tailwind-css-docs`
- Input: `fixtures/data/context7-tailwind-docs.md`, 4102 B, sha256 d0307fa05b356fbd45451317ffeb324dcbf959577772a9da0b7c87d9c98d7a02

## b-skill-context-mode-main-prompt

Skill: context-mode (main prompt)

- Command: `node run.mjs b-skill-context-mode-main-prompt`
- Input: `fixtures/data/skills/skill-main.md`, 16683 B, sha256 ce26cb01de7a116eab256f916620935f029e850771f3fb6cb7d40a3ce8d1f7ff

## b-skill-references-4-files-combined

Skill references (4 files combined)

- Command: `node run.mjs b-skill-references-4-files-combined`
- Input: `fixtures/data/skills/patterns-javascript.md`, 9598 B, sha256 e0e6e6d17d2df8d93cff0922fb42b21382328d3d14a9bc32f62f0b3f127fc723
- Input: `fixtures/data/skills/patterns-python.md`, 9282 B, sha256 8d76144c9e812a54c884b815f526fea85179839fcc70b205bfde1e757ae95fec
- Input: `fixtures/data/skills/patterns-shell.md`, 6814 B, sha256 34be33127c296b273e03cf1d8c373c57083e160a1a2ac3876dca010c74689877
- Input: `fixtures/data/skills/anti-patterns.md`, 10368 B, sha256 fd6112a5d73375ff2bb3029479766b9927cab48db982fa2a3019682c1c8a3a7d

## b-mcp-tools-list-40-tools

MCP tools/list (40 tools)

- Command: `node run.mjs b-mcp-tools-list-40-tools`
- Input: `fixtures/data/mcp-tools.json`, 17362 B, sha256 290dac23e92d735bfc532c6e757df79725217e4871326cdffcb878c0ada973ef

## b-html-docs-page-sqlite-org-fts5-215-kb

HTML docs page (sqlite.org FTS5, 215 KB)

- Command: `node run.mjs b-html-docs-page-sqlite-org-fts5-215-kb`
- Input: `fixtures/data/sqlite-fts5-docs.html`, 215354 B, sha256 de3092630358518a6869bf047055b3938e18b476e3fbc54f4e2146d1e593497f
