# Context Mode v2 hooks: bytes saved on 10 agents

On a shell `cat` of a log of about 200 KB, the v2 hook cut what the model sees by **99.7% to 99.9%** on all 10 agents. The model still got the one line it needed (the `FATAL` line) on all 10.

## Key facts

- **What it is:** one test per agent. Same task on each: read a log of about 200 KB with one `FATAL` line, and find the value on that line.
- **Arms:** Off = the raw tool output the agent would pass to the model with no context-mode. v2 = what the model sees after the v2 hook runs (the replaced output, or the deny text plus the result of the `ctx` tool it points to).
- **Date:** 2026-10-26. Branch `v2-design`. Workflow: [hooks-fast.workflow.js](../../v2/review/hooks-fast.workflow.js).
- **Method:** `context-mode setup` and `doctor` ran in a clean temp HOME from the packed release. The test then built the hook input the host's own docs describe, sent it to the hook command that `setup` registered, and checked the output against those docs.
- **Pass rule:** hook registered, hook ran, v2 bytes under half of off bytes, answer present, skill names the host's real tool. All 10 pass.
- **Limits:** No live model session ran. The bytes are what the docs say the host passes to the model, not bytes read from a real transcript. Kiro, ZCode and VS Code have no CLI on this machine, so we did not prove that those hosts load our files; we checked the files against their docs. One run per agent.

## Results

| Agent | Host version | Off (bytes) | v2 (bytes) | Saved | How v2 saves | Host docs |
|---|---|---:|---:|---:|---|---|
| Claude Code | 2.1.310 | 196,149 | 286 | 99.85% | replaces the tool output | [hooks](https://code.claude.com/docs/en/hooks) |
| Codex | 0.156.1 | 217,858 | 392 | 99.82% | replaces the tool output | [hooks](https://developers.openai.com/codex/hooks) |
| Gemini CLI | 0.65.0 | 168,875 | 343 | 99.80% | replaces the tool output | [hooks](https://geminicli.com/docs/hooks/reference/) |
| Qwen Code | 0.26.1 | 212,544 | 332 | 99.84% | denies the call, points to `ctx` | [hooks](https://qwenlm.github.io/qwen-code-docs/en/users/features/hooks/) |
| Copilot CLI | 1.0.103 | 203,669 | 384 | 99.81% | replaces the tool output | [hooks](https://docs.github.com/en/copilot/reference/hooks-configuration) |
| OpenCode | 1.19.4 | 198,645 | 235 | 99.88% | in-process plugin | [plugins](https://opencode.ai/docs/plugins/) |
| Pi | 0.73.1 | 200,062 | 160 | 99.92% | in-process extension | [extensions](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/docs/extensions.md) |
| VS Code | not run | 204,513 | 560 | 99.73% | replaces the tool output | [hooks](https://code.visualstudio.com/docs/copilot/customization/hooks) |
| Kiro | not run | 183,551 | 242 | 99.87% | denies the call, points to `ctx` | [hooks](https://kiro.dev/docs/hooks/) |
| ZCode | not run | 169,068 | 443 | 99.74% | denies the call, points to `ctx` | [hooks](https://zcode.z.ai/en/docs/hooks) |

Off sizes differ a little because each agent's test made its own log.

## Evidence

- Raw rows (bytes, checks, evidence text and problems per agent): [results.json](results.json).
- Fixes found by these runs: [hooks-all RESULT](../../v2/spikes/hooks-all/RESULT.md), [DEVIATIONS](../../v2/impl/DEVIATIONS.md) (rows `D-HA-*`, `D-HF-*`, `D-HQ-*`).
- Hook channel and skills per agent: [ADR-0020](../../v2/adr/0020-hooks-and-skills-on-every-agent.md), [install table](../../install/README.md).

## Next

- A live session per agent, with bytes read from the real transcript.
- Open on 2026-10-26: some hook texts still name `ctx_search` without the host's prefix (fix in progress). It does not change the byte counts above.
