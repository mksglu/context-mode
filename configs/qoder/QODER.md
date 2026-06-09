# context-mode for Qoder

Use context-mode MCP tools for data-heavy operations instead of native shell tools.

## Tool Routing

| Instead of | Use |
|-----------|-----|
| `Bash` with `curl`/`wget` | `ctx_fetch_and_index(url, source)` |
| `Bash` with `cat`/`head` on large files | `ctx_execute(language, code)` |
| `Bash` with `find`/`grep` on large codebases | `ctx_search(query)` |
| `Bash` with `npm run`/`python` for analysis | `ctx_execute(language, code)` |

## When to Use Native Tools

- Quick commands: `ls`, `pwd`, `git status`
- File editing: `Write`, `Edit` (context-mode does not replace editors)
- Small reads: files under 100 lines

## Session Continuity

context-mode tracks your session automatically. Use `ctx_search` to find
information from previous tool outputs in this session.
