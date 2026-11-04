# Reply to the Windows tester, 2026-11-01

Thank you for the retest. Your regression checks on Codex 0.166 and Claude Desktop found three real faults. All three are fixed in `2.0.0-next.24` (npm tag `next`).

## 1. npm README links

The links in the npm README pointed at `main`. They now point at the release tag. We opened the README of `context-mode@next` (2.0.0-next.24): 80 links and images, 78 returned 200. The other 2 are the npm package page (it answers scripts with 403) and the Discord invite (it timed out from our machine). All 55 links and images that point into our repository use the tag `v2.0.0-next.24`, and every linked file exists at that tag.

## 2. Source label

Cause: path labels used the OS separator, so `ctx_index({path:"data/sqlite-fts5-docs.html"})` stored `data\sqlite-fts5-docs.html`, and the `source` filter compared the label as exact text.

Fix:
- A path label has one form on every OS: forward slashes, relative to the project.
- `source` in `ctx_search` and `ctx_purge` takes either slash form.
- Schema version 6 renames old backslash labels in place. Your data stays and stays findable.
- The bench now prints `MISS` for a scenario whose own quality check fails, and counts it in the last line.

## 3. Fresh native Codex install

Cause: after `codex plugin add`, Codex lists the plugin hooks as untrusted and skips them. The MCP `ctx_doctor` D5 read the plugin files, so it showed PASS while `cat` ran unchecked.

Fix: `ctx_doctor` D5 now asks Codex (`hooks/list`) and FAILs with the setup command until the hooks are trusted. The terminal doctor and D5 use the same check.

Please rerun on the new version:

```sh
codex plugin marketplace upgrade context-mode
context-mode setup --agents codex
context-mode doctor --agents codex
```

Restart Codex, then call `ctx_doctor`: D5 should PASS and a `cat` of a large log should return the `ctx_execute` redirect. When a check FAILs, the doctor prints a `gh issue create` command and a report file under `~/.context-mode/reports/`. Please attach that file.

Thank you again for the careful retest.
