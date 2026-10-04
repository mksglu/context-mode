# Context Optimization

context-mode reduces the context window an AI coding agent consumes. It observes tool
calls, routes work that would flood the window into sandboxes, and keeps durable memory of
the session so a later session can resume without the transcript. This glossary fixes the
words used for those concepts, because the backlog shows the same defect filed under three
different names often enough that deduplication is impossible without them.

## Hosts

**Platform**:
A host agent runtime that context-mode integrates with — Claude Code, Codex, Pi, OpenCode,
Copilot CLI, and the rest.
_Avoid_: Host, target, runtime, IDE

**Adapter**:
The per-platform implementation of context-mode's hooks and tool naming. Several platforms
share one adapter, so the mapping is not one-to-one.
_Avoid_: Plugin, integration, connector, backend

**Project root**:
The directory a platform considers the user's workspace, which is the anchor for every
relative path context-mode resolves. It is not the process working directory and not the
directory context-mode is installed in.
_Avoid_: CWD, workspace root, repo root, base dir

**Sidecar**:
The helper process a platform launches to bring up the MCP server and self-heal a broken
install. It is the component most likely to be running when something is wrong at startup.
_Avoid_: Launcher, bootstrap, shim, daemon

## Routing

**Route decision**:
The verdict a platform's pre-tool hook returns for one tool call: let it run, redirect it, or
deny it. The verdict is about the *command*, never about the words that appear inside it.
_Avoid_: Gate, decision, verdict, policy

**Redirect**:
A route decision that replaces a command with an equivalent that produces less context. A
redirect that never runs the user's work is a failure, not a redirect.
_Avoid_: Rewrite, substitution, shim, nudge

**Advisory**:
A route outcome that informs without blocking. Distinct from a deny: a deny makes the tool
unavailable, an advisory leaves it available and explains the better path.
_Avoid_: Warning, hint, suggestion, soft-deny

## Memory

**Session event**:
One durable fact extracted from a tool call — a decision, an error, a file edit, a cost
observation. Events are the unit of recall; nothing is remembered that is not an event.
_Avoid_: Record, entry, log line, memory item

**Priority**:
How much a session event matters when the budget for recall is tight. Higher importance is
retained longer under pressure; events are evicted in ascending order of importance, so the
ordering of the eviction query is load-bearing and reversing it destroys the newest data
first.
_Avoid_: Weight, rank, severity, importance

**Snapshot**:
A bounded block of session events injected into a later session, or into a session that is
about to be compacted. Its advertised size and its real size are the same claim; a snapshot
that exceeds its budget is a defect, not a rounding error.
_Avoid_: Digest, summary, recap, briefing

**Source**:
One indexed body of content, addressed by a label. A source is either populated or absent —
never silently empty, because an empty index and a missing one are indistinguishable to a
caller unless the tool says which.
_Avoid_: Document, collection, corpus, index

**Content store**:
The durable store of indexed sources. It prunes on age and is expected to stay bounded.

**Session database**:
The durable store of session events for one project, with retention driven by last activity
rather than creation time. Distinct from the content store: different contents, different
lifetimes, different pruning.
_Avoid_: DB, store, cache, store (use one of the two names above)

## Measurement

**Avoided bytes**:
Bytes the agent never had to read because context-mode replaced them. Only bytes from a
measured redirect count. Binary reads and tool responses are not avoided bytes.
_Avoid_: Saved tokens, tokens saved, savings

**Reduction ratio**:
Avoided bytes as a fraction of what the agent would otherwise have read, with the returned
content counted in the denominator exactly once. It is a byte ratio and must never be
presented as a time ratio or a token count.
_Avoid_: Compression ratio, savings percentage, efficiency

**Capped**:
True only when a limit actually bound the result. A run whose limit exceeded its workload is
not capped, and reporting it as capped is a false claim.
_Avoid_: Truncated, limited, bounded

## Build

**Bundle**:
A generated, source-tracked artifact produced by the build. It is what ships, so a change to
source that is not accompanied by a regenerated bundle does not reach the user even when
every test passes.
_Avoid_: Dist, build output, compiled output, artifact
