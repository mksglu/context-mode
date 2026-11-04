# Fixture source

Copied byte for byte from github.com/mksglu/context-mode at commit
90af14e34bf35120c3310f7a75f54fa99d2cabba (origin/main):

- `tests/fixtures/*` (15 files) -> `bench/fixtures/data/`
- `skills/context-mode/SKILL.md` (as `skill-main.md`, GS5 allows no other SKILL.md) and `skills/context-mode/references/{anti-patterns,patterns-javascript,patterns-python,patterns-shell}.md` -> `bench/fixtures/data/skills/`

The skill files are inputs to two v1 index+search scenarios (tests/live-benchmark.ts).
They are fixtures here, not v2 skills.

## Added for the bench suite (2026-10-31)

Captured on 2026-10-31. No tokens, emails or home paths in any file (checked with grep).

| File | Source | Bytes | sha256 |
|---|---|---:|---|
| sqlite-fts5-docs.html | https://www.sqlite.org/fts5.html, as served | 215354 | de3092630358518a6869bf047055b3938e18b476e3fbc54f4e2146d1e593497f |
| github-api-issues-large.json | `GET https://api.github.com/repos/vercel/next.js/issues?per_page=30&state=open`, unauthenticated | 219175 | bd2bdb943de007b7bb57d4e4a53a01ad801cf57606a3228682b39d05eb8a5e16 |
| source-big.ts | src/core/contracts/constants.ts of this repo at efe519b1 | 61576 | 7b4ba6812418434b9c682875de2454668ed98f3e0791f9e2b528ac034ec6e725 |
| git-log-large.txt | `git log -n 2000 --format='%h %ad %s' --date=short` of this repo at efe519b1 | 191120 | 028317819bc1a93fcfbeeba2d5ffea829fe4c439e3889d688f76fbb11bb913ad |
| npm-install-log.txt | `npm install --no-package-lock --loglevel http --no-audit --no-fund` of this repo's devDependencies, clean cache home | 37761 | 54fe053a4c8ece97a96bef23b019a9120a230af1e17eddd70d4a046dd48a9af0 |

Synthetic inputs (seed 20261031, generated in the scenario code, not stored): d-synth-120k, d-synth-1m, e-long-session.
