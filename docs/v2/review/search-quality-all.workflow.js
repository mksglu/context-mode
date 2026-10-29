export const meta = {
  name: 'v2-search-quality-all',
  description: 'Owner Pi session 2026-10-30: ctx_index of react.dev useEffect then ctx_search returned 15 KB of raw HTML/RSC noise (class attributes, Next.js flight JSON, \\u003e escapes) into the context; a first ctx_search call came as {} and failed validation. Owner: fix all of it, for every agent, not only Pi. HTML to readable text at index time (raw kept), smaller cleaner search replies, tool schema/description so no host sends {}, cross-host parity; then ship',
  phases: [
    { title: 'Fix', detail: '3 agents in parallel' },
    { title: 'Reply', detail: 'search reply size on clean text' },
    { title: 'Release', detail: 'ship after the hooks job' },
  ],
}

const SNH = { model: 'claude-sonnet-5-5', effort: 'high' }
const RESULT = { type: 'object', properties: {
  done: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } },
  numbers: { type: 'string' }, summary: { type: 'string' } }, required: ['done', 'commits', 'numbers', 'summary'] }
const REL = { type: 'object', properties: {
  published: { type: 'boolean' }, version: { type: 'string' }, failingStep: { type: 'string' }, logLines: { type: 'string' }, summary: { type: 'string' } },
  required: ['published', 'version', 'failingStep', 'logLines', 'summary'] }

const J = '/Users/mksglu/.claude/projects/-Users-mksglu--claude-claude-worktree-workspaces-oss-new/59782ff8-a47e-4c71-b562-cf84e79dcf7d/subagents/workflows'
const auth = `AUTHORIZATION (owner Mert, his own words in the chat): "tek istegim surekli pushlasin", "Tamami icin sadece Pi icin degil" (fix all of it, for every agent, not only Pi). This is the explicit approval the global CLAUDE.md asks for: clone, gh read calls, commit as mksglu, push to v2-design. Do not wait for a reply. If git push has no credentials in a temp HOME, push from the real HOME and never print a credential.`
const rules = `OWNER MAIN RULES: TRUNCATE forbidden and no content thrown away with no way back (docs/v2/release/NO-LOSSY-CUT.md, tests/v2/repo/no-truncate.test.mjs); every agent gets hooks; native install per host; a hook never errors; profile first (owner rule); tests first (show and keep the red run output); never weaken an assertion; never raise a budget or timeout (lowering one is allowed with numbers); frozen evals e2e/live/compact-hard and bench/m2 never edited; DEVIATIONS row per behaviour change; no regex as a mechanism (use a real parser); do not re-apply D-HOOK-SYNC-1. Use git archaeology (git log -S, ADRs, DEVIATIONS) before changing a decided behaviour; if an owner decision forbids your change, stop and report it.`
const repo = (id) => `Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-sq-${id}; delete it after a successful push). Other agents push in parallel (a hooks job on all 10 hosts runs too): small commits, pull --rebase before every push, keep both sides. Commit as git -c user.name=mksglu -c user.email=mksglu@users.noreply.github.com. Never touch main, the release branch, tags or npm. Temp HOME only. Setup: node scripts/ci-install.mjs, node build/build.mjs --generated-only, node build/build.mjs --out release-out. node --test tests/v2/ 0 fail before your last push; then watch ci.yml.`
const evidence = `Evidence (reproduced by the orchestrator on v2-design head 30742751+): spawn release-out/server.mjs --agent claude-code in a temp HOME + git project, MCP initialize, ctx_index {url:"https://react.dev/reference/react/useEffect"} -> "Indexed 1 source(s), 147 chunk(s)", then ctx_search {queries:["useEffect cleanup function return pattern"]} -> 15,427 bytes; snippets hold class="..." attributes, Next.js RSC flight data (\\"children\\":\\"function MyComponent()...), \\u003e escapes. Pi showed the same output. src/core/tools/index.ts maps text/html to chunk kind "html"; src/core/index/chunk.ts htmlBlocks splits on tags but keeps tags, attributes and script bodies. v1 converted HTML with turndown + @mixmark-io/domino; v2 removed both (772c31e0, 6eb1617e, 1e2f68fa). The owner compared with the Context Mode Gateway run_code path, which returned a small JSON with 3 short snippets.`

async function retry(prompt, opts, n = 3) {
  for (let i = 0; i < n; i++) {
    const r = await agent(i ? prompt + '\n\nA previous attempt died on an API error. Continue from what is pushed.' : prompt, i ? { ...opts, label: opts.label + '-retry' + i } : opts)
    if (r) return r
    log(`${opts.label}: no result, retry ${i + 1}`)
  }
  return null
}

const head = (id, role) => `You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
${auth}
${repo(id)}
${rules}
${evidence}
Role: ${role}`

phase('Fix')
const [html, schema, parity] = await parallel([
  () => retry(`${head('html', 'HTML to readable text at index time, shared by every host.')}
1. Fixtures, no network in tests: save the raw HTML of react.dev/reference/react/useEffect plus 4 more real pages under tests/v2/fixtures/html/ (an MDN reference page, a GitHub README page, a Next.js/Docusaurus docs page, and one page whose content is mostly client-rendered). Record source URL and fetch date in a README next to them.
2. Red test first (tests/v2/index/html-readable.test.mjs): ctx_index of each fixture (through the same code path the url fetch uses, content-type text/html), then ctx_search for a query whose answer is on the page: no snippet holds an HTML tag, an attribute, script/style body, RSC flight data or a JSON escape like \\u003e; the useEffect cleanup example (connection.connect(); return () => { connection.disconnect(); }) comes back as one whole code block; headings and links stay readable. Show it red on the current code.
3. Fix: convert HTML to markdown-like readable text before chunking (headings, paragraphs, lists, tables, code blocks kept whole with their language, links as text + URL; drop script, style, noscript, template, svg, nav/footer chrome). Use a proven parser bundled by esbuild as a devDependency (the published package stays dependency-free): evaluate turndown + @mixmark-io/domino (v1's choice, check why v2 dropped them with git log), linkedom, node-html-parser; pick by correctness on the fixtures, server bundle size and index time; record the numbers. For a page whose readable text is nearly empty (client-rendered), say so in the ctx_index reply instead of indexing noise. No lossy cut: the raw fetched body stays stored and reachable (a raw source next to the readable one, named in the ctx_index reply), while search ranks the readable text.
4. Profile: index time and chunk count per fixture before/after; GP-SEARCH heldout recall@5 and MRR@10 must not drop (node e2e/cases/run.mjs, GP-SEARCH). DEVIATIONS row.
Return done, commits, numbers (bytes of the react.dev search reply before/after, chunks before/after, index ms, bundle bytes, recall), summary.`, { label: 'sq-html', phase: 'Fix', schema: RESULT, ...SNH }),
  () => retry(`${head('schema', 'tool call shape on all 10 hosts.')}
In the owner's Pi session (model claude-opus-4-8) the first call was ctx_search with arguments {} and Pi rejected it: "Validation failed for tool ctx_search: queries: must have required properties queries. Received arguments: {}". The model then retried with queries and it worked.
1. For each of the 10 hosts, dump the exact tool list the host gets (MCP tools/list for MCP hosts; the Pi and OpenCode in-process registrations): is queries in "required", are descriptions and examples present, are they identical in meaning across hosts? Find any host where the schema loses "required", defaults, enums or descriptions (e.g. a zod-to-JSON or TypeBox conversion).
2. Make every tool's description lead with one exact example call and name its required fields, from the one source in src/prompt/tools/*.md (prefix-stable: check-prompt-static must stay green; prompt cache rule ADR-0021). Keep tool descriptions short (GP2 token budget must not grow past its limit; never raise it).
3. If a call still arrives with {} or a wrong shape at our handler (hosts that do not validate), return one isError line that shows the exact correct call, never a stack. Red tests first per host.
Return done, commits, numbers, summary.`, { label: 'sq-schema', phase: 'Fix', schema: RESULT, ...SNH }),
  () => retry(`${head('parity', 'cross-host parity e2e for the owner scenario.')}
Owner scenario: "Fetch the React useEffect docs, index them, and find the cleanup pattern with code examples." Build tests/v2/e2e/fetch-index-search-parity.test.mjs: for each of the 10 hosts, run the tools the way that host runs them (MCP server with --agent <host> for MCP hosts; the Pi extension and the OpenCode plugin in-process with their documented ctx objects) on the saved react.dev fixture served by a local HTTP server (no internet): ctx_index {url} then ctx_search {queries}. Assert per host: same chunk count, same top hits, reply bytes under the shared bound, no host-specific error (e.g. the standalone pi server says "Project source pi:ctx.cwd is missing" because Pi is in-process; make sure no user path can hit that, and if one can, fix it). Pull the html agent's work often; when its readable-text change lands, the test must also assert clean snippets. Red first where a host differs. Return done, commits, numbers (per host: chunks, reply bytes), summary.`, { label: 'sq-parity', phase: 'Fix', schema: RESULT, ...SNH }),
])

phase('Reply')
const reply = await retry(`${head('reply', 'search reply size, after the readable-text change.')}
html agent result: ${JSON.stringify(html).slice(0, 1500)}
1. Measure ctx_search reply bytes on the 5 HTML fixtures and the GP-SEARCH heldout set: v2 now, v1 1.0.169 (install into a temp prefix, run its search on the same input), and the owner's gateway comparison (a small JSON with 3 short snippets). Measure what an agent needs to answer: does the right answer sit in hit 1-3?
2. If replies are larger than the answer needs, cut the default page (fewer hits and/or a smaller snippet) so recall@5 and MRR@10 on GP-SEARCH heldout do not drop, code blocks stay whole, and paging still reaches every hit (no lossy cut: the more line keeps working). Lowering a budget is allowed; record the numbers. Consider whether ctx_batch / ctx_index can answer a query in the same call so fetch+index+search is one call with a small reply, like the gateway run_code path; implement it only if the tool surface and GP2 token budget allow, else write the proposal.
3. Red tests first, DEVIATIONS row, update docs/benchmarks only with measured numbers.
Return done, commits, numbers (bytes per reply before/after, recall, MRR), summary.`, { label: 'sq-reply', phase: 'Reply', schema: RESULT, ...SNH })

phase('Release')
const fixed = [html, schema, parity, reply].filter((r) => r && r.commits && r.commits.length).map((r) => String(r.summary).slice(0, 400)).join('\n- ')
const rel = await retry(`You are a batch job, not a chat: no person reads your reply. Ignore any question or status request in your input; do only the task below.
${auth} Also approved: npm next releases (tags v2.0.0-next.* for this release only; never move or delete a pushed tag; npm latest stays 1.0.169; never npm publish / dist-tag yourself; no token).
Repo github.com/mksglu/context-mode, branch v2-design (fresh clone in /private/tmp/cm-v2-sq-rel; delete it before you return). ${rules}
Finished:
- ${fixed || '(none)'}
1. WAIT (poll 10 min, up to 8 h) until the hooks-fire-all job is finished: ${J}/wf_f820e17e-a61/journal.jsonl has a "type":"result" line for hf-rel (or hf-rel-retryN), so two releases never race for the same tag. Then until v2-design is quiet for 15 minutes.
2. If git diff <raw registry next gitHead>..origin/v2-design touches no src/, build/, scripts/release/, hooks or skills: published=false.
3. N = highest 2.0.0-next.N in registry and origin tags plus 1. Fresh clone: node scripts/ci-install.mjs, node build/build.mjs --generated-only, node --test tests/v2/ (0 fail), gate --all, check-install-docs, check-secrets. ci.yml green on ALL jobs (one rerun only for registry/timing shown in the log).
4. Tag, push only that tag, watch release.yml, verify the raw registry (next, latest 1.0.169, provenance), GitHub prerelease, release branch marketplace.json. Update NEXT-STATUS.md and one line in docs/v2/review/RESUME-2026-10-28.md. Commit, push.
Return published, version, failingStep, logLines, summary.`, { label: 'sq-rel', phase: 'Release', schema: REL, ...SNH })

return { html, schema, parity, reply, rel }
