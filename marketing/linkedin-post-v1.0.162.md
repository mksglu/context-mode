# LinkedIn post — context-mode.com launch (v1.0.162)

## 1. Final post text (paste-ready)

First commit of context-mode went out on February 23. I fully expected it to be obsolete in six months. Long context windows were going to fix the problem from the model side, and I'd move on.

It's at 260.4k+ users today. v1.0.162. Long context didn't fix the actual problem. The agent still dumps a 56 KB Playwright snapshot and a 45 KB access log into one turn, and 30 minutes later it has forgotten which file you were editing.

context-mode is the MCP server that fixes that. Raw tool output goes to a local sandbox. The model sees only what your code chose to print. 315 KB collapses to 5.4 KB. That's the ~98% number on the landing page.

Today I'm opening the second product on top of it: Insights.

The OSS plugin runs on one developer's machine. Insights is the team-level observability layer. Engineering leads who already shipped Claude Code, Codex, Cursor, OpenCode, Gemini CLI, Kiro, Zed, Qwen Code, Kilo, or Antigravity to their team finally get a view of what's actually happening: where engineers are blocked, which patterns keep tripping people up, where the human bandwidth is going, who needs help. The same thing Datadog gave you for infra, but for AI coding work.

Live now at https://context-mode.com.

The OSS plugin: https://context-mode.com/oss. Install path depends on your CLI (Claude Code is `/plugin marketplace add mksglu/context-mode`, others are on the page). License is ELv2, source-available, free to use with a clause preventing resale as a hosted service.

Insights is in early-access beta. If you lead an engineering team already using AI agents in production and want in, reply or DM. I'll get you set up directly.

My honest belief: every engineering org that ships AI agents to its engineers in 2026 is going to need this layer, because right now the leads are flying blind. They picked the tool, they're paying for the tokens, and they have no idea whether it's working. Insights is what I wanted when I was the lead trying to answer that question.

Thanks to everyone who has been filing issues on the OSS. The roadmap is what it is because of you.

---

## 2. Data sources used

| Claim | Source |
|---|---|
| First commit Feb 23 | `git log --reverse` → `60a1a25 2026-02-23 09:02:37` |
| 260.4k+ users | `stats.json` field `message` |
| v1.0.162 | `package.json` field `version` |
| 56 KB Playwright, 45 KB access log, 315 KB → 5.4 KB, ~98% | `README.md` lines 34, 40 |
| MCP server description | `README.md` line 38 |
| Adapter list (10 CLIs) | Landing page §08 Adapter Showcase (Mert-trimmed prior turn) |
| License ELv2 | `LICENSE` line 1 |
| ELv2 hosted-service clause | `LICENSE` lines 18-20 |

## 3. AI pattern audit (caught and removed)

- License: previously claimed MIT. Read `LICENSE`, found Elastic License 2.0 (ELv2), corrected.
- Em dashes: zero in final (search `—` returns no matches).
- Emojis: zero (rule 14).
- Promotional language: none. No "groundbreaking", "revolutionary", "seamless", "cutting-edge".
- Significance inflation: none. No "pivotal", "testament", "vital role", "landscape".
- Rule of three: caught and broken. Initial draft had "56 KB Playwright + 59 KB GitHub + 45 KB access log" (forced trio from README); reduced to two concrete numbers.
- Negative parallelism: none. No "not X but Y".
- Solo-founder flex: caught and removed. Initial draft had "fair given I'm one person" — dropped per [[feedback_no_solo_founder_flex]].
- Copula avoidance: none. Uses "is/are/has" throughout.
- AI vocabulary: none. No "delve", "foster", "interplay".
- Sentence length: varied (2 words to 40 words).
- Hook: personal confession ("expecting it to be obsolete in six months").
- Close: genuine belief, not sales pitch.
- Community gratitude in final paragraph (per [[feedback_no_solo_founder_flex]]).
