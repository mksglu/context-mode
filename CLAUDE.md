# context-mode

Raw tool output floods your context window. Use context-mode MCP tools to keep raw data in the sandbox.

## Tool Selection

1. **DELEGATE**: `delegate(tasks)` — **PREFER THIS** when task involves analyzing, reviewing, or understanding multiple files (>5). Spawns parallel sub-agents with pre-read files. Results auto-indexed.
2. **GATHER**: `batch_execute(commands, queries)` — Run commands, auto-index, search. For shell commands and CLI output, not file analysis.
3. **FOLLOW-UP**: `search(queries: ["q1", "q2", ...])` — Use for all follow-up questions. ONE call, many queries.
4. **PROCESSING**: `execute(language, code)` or `execute_file(path, language, code)` — Use for API calls, log analysis, and data processing.
5. **WEB**: `fetch_and_index(url)` then `search(queries)` — Fetch, index, then query. Never dump raw HTML.

## Rules

- DO NOT use Bash for commands producing >20 lines of output — use `execute` or `batch_execute`.
- DO NOT use Read for analysis — use `execute_file`. Read IS correct for files you intend to Edit.
- DO NOT use WebFetch — use `fetch_and_index` instead.
- DO NOT use curl/wget in Bash — use `execute` or `fetch_and_index`.
- Bash is ONLY for git, mkdir, rm, mv, navigation, and short commands.

## Output

- Keep responses under 500 words.
- Write artifacts (code, configs) to FILES — never return them as inline text.
- Return only: file path + 1-line description.
