# Security

## Threat model — `ctx_execute*` runs arbitrary code

context-mode's value is running code and commands in a sandbox so their raw
output never floods the model's context. That sandbox is about **output
hygiene**, not privilege isolation. `ctx_execute`, `ctx_execute_file`, and
`ctx_batch_execute` execute arbitrary code in a subprocess that runs with **your
user account's full privileges**.

Two consequences follow, and they are by design:

1. **The MCP executor does not inherit the harness sandbox.** Editors/agents
   such as Claude Code can run with their own filesystem sandbox ("only this
   project is readable"). context-mode runs as a separate MCP server process,
   so code launched through it is **not** subject to that sandbox. If you enable
   the harness sandbox expecting project confinement, `ctx_execute_file` /
   `ctx_execute` can still read files outside it
   ([#852](https://github.com/mksglu/context-mode/issues/852)).

2. **The permission prompt is opaque.** When the host asks you to approve a
   `ctx_execute*` call, it cannot show you what the embedded code/command will
   do — the harness does not parse MCP tool inputs. Approving the tool is
   therefore equivalent to approving **arbitrary code execution**.

The pattern-based deny rules documented in the README (`Bash(sudo *)`,
`Read(**/.env*)`, …) are a real, useful layer, but they only block what you
explicitly deny and they are not a confinement boundary: arbitrary code can
read files via direct syscalls regardless of `Read(...)` globs.

**Treat granting `ctx_execute*` as granting full code execution as your user.**
Only enable context-mode in repositories and sessions you trust.

## Mitigation — opt-in OS-level filesystem confinement (Linux)

For a real boundary against project-external reads, set:

```bash
export CONTEXT_MODE_CONFINE_FS=1
```

On Linux ≥ 5.13 with a C compiler available (`cc`/`gcc`/`clang`), context-mode
compiles a tiny launcher that applies a [Landlock](https://docs.kernel.org/userspace-api/landlock.html)
ruleset before exec'ing the runtime. Landlock restrictions are unprivileged,
irreversible, and inherited by every descendant, so even arbitrary code run by
`ctx_execute` cannot read outside the allow-list.

**Allow-list:** the project root, the per-execution sandbox temp directory, the
runtime's own install directory, and the system directories a runtime must read
to start (`/usr`, `/lib*`, `/bin`, `/etc`, `/proc`, `/dev`, … — world-readable
system paths, not your private data). Everything else, including `$HOME` outside
the project and other repositories, is denied.

**Fails closed.** If confinement is requested but cannot be applied (no compiler,
kernel without Landlock, unsupported platform), the executor refuses to run
rather than running unconfined.

### Limitations

- **Linux only** in this version. On macOS/Windows, setting
  `CONTEXT_MODE_CONFINE_FS` returns an error rather than silently running
  unconfined. macOS (`sandbox-exec`) and a Windows story are tracked follow-ups.
- **Reads only.** This version governs filesystem *reads* (the reported issue).
  Writes and network egress are not yet confined.
- **Off by default**, so legitimate out-of-project reads (e.g. `~/.config`,
  sibling repositories) keep working unless you opt in.
- Not a defense against kernel exploits or against a runtime you explicitly
  grant access to a sensitive path.

## Network fetch hardening

`ctx_fetch_and_index` blocks `file://`/`gopher://`/`javascript:`/`data:`
schemes, cloud-metadata and link-local ranges (`169.254.0.0/16`), and
multicast/reserved ranges by default. Set `CTX_FETCH_STRICT=1` to additionally
block loopback + RFC1918 + ULA for hosted/shared deployments. See the README
"Network fetch hardening" section for details.

## Reporting a vulnerability

Open a private security advisory on the GitHub repository, or contact the
maintainer rather than filing a public issue for exploitable findings.
