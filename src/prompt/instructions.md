context-mode keeps large output out of the conversation.

When a step counts, sums, filters or finds something in over about 20 lines of data (logs, test or build output, big JSON or CSV, long files, web pages), use ctx_execute and print only the answer, not a raw Bash or Read result.

A large tool result is indexed and cut to its best-matching parts; ctx_search finds the rest. A large file's Read is denied: use offset and limit, or ctx_execute with file set. Use normal tools for small output and edits.
