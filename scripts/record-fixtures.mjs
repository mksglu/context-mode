#!/usr/bin/env node
// scripts/record-fixtures.mjs
// GP3 fixture recorder (14-tests.md §4 GP3 "Inputs"; Assumption A6; 10-adapters.md §1.4/§1.5;
// DECISIONS-r9 R6, T-CX; ADR-0001 §1; ADR-0012 keyless live harness).
//
// Two modes:
//
//   --capture <outdir> <event>
//     Hook-capture mode. This is the command string the driven agent's own hook config
//     invokes. It reads the native hook payload from stdin and writes it byte-for-byte
//     to <outdir>/<event>.json. No parsing, no field changes — "dumps stdin as-is" (#1222).
//
//   <agent>   (claude-code | codex)
//     Driver mode. Creates a temp project under
//     /private/tmp/cm-v2-impl-private/fixtures-<agent>-*, writes a project-scoped hook
//     config whose command is this same file in --capture mode, drives the agent once
//     with a prompt that makes it run one Bash command, then copies each captured payload
//     into e2e/fixtures/<agent>/<ver>/<event>.json after normalize() replaces only the
//     volatile private-data fields (session id, transcript_path, cwd, home prefix) — field
//     names, nesting and every other value stay exactly as recorded.
//
// Never reads from or writes into ~/.claude/projects (owner transcript privacy rule).

import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  symlinkSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { normalize } from "../e2e/harness/normalize.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const PRIVATE_ROOT = "/private/tmp/cm-v2-impl-private";
const EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse"];
const SELF = path.join(__dirname, "record-fixtures.mjs");

const AGENTS = {
  "claude-code": {
    ver: "2.1.283",
    bin: "/opt/homebrew/Caskroom/claude-code@latest/2.1.283/claude",
  },
  codex: { ver: "0.156.1", bin: "codex" },
};

function keylessEnv(extra = {}) {
  // env -i PATH HOME USER TMPDIR — the only vars the keyless live harness passes through
  // (ADR-0012 "Child environment"); no ANTHROPIC_*, no CLAUDE_CONFIG_DIR.
  return {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    USER: process.env.USER ?? "",
    TMPDIR: process.env.TMPDIR ?? os.tmpdir(),
    ...extra,
  };
}

// --- capture mode -----------------------------------------------------------

function captureMode(outDir, event) {
  const chunks = [];
  process.stdin.on("data", (c) => chunks.push(c));
  process.stdin.on("end", () => {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, `${event}.json`), Buffer.concat(chunks));
    process.stdout.write("");
    process.exit(0);
  });
}

// --- hook config (Claude shape — Codex's own hooks.json uses the same shape,
// 10-adapters.md §1.5 codex row: "$CODEX_HOME/hooks.json (same shape as Claude Code)") ----

function claudeShapeHooks(outDir) {
  const hooks = {};
  for (const ev of EVENTS) {
    hooks[ev] = [
      {
        matcher: ".*",
        hooks: [
          {
            type: "command",
            command: `node ${SELF} --capture ${outDir} ${ev}`,
            timeout: 10,
          },
        ],
      },
    ];
  }
  return { hooks };
}

// --- claude-code driver -------------------------------------------------------

function driveClaudeCode(outDir) {
  const projectDir = mkdtempSync(path.join(PRIVATE_ROOT, "fixtures-claude-code-"));
  const claudeDir = path.join(projectDir, ".claude");
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(
    path.join(claudeDir, "settings.json"),
    JSON.stringify(claudeShapeHooks(outDir), null, 2)
  );

  const { bin } = AGENTS["claude-code"];
  const args = [
    "-p",
    "Run exactly one Bash command: echo gp3-fixture-probe. Then stop.",
    "--setting-sources",
    "project",
    "--model",
    "claude-sonnet-5",
    "--effort",
    "low",
    "--max-budget-usd",
    "0.25",
    "--allowedTools",
    "Bash",
  ];
  const r = spawnSync(bin, args, {
    cwd: projectDir,
    env: keylessEnv(),
    encoding: "utf8",
    timeout: 120_000,
  });
  return { r, projectDir };
}

// --- codex driver -------------------------------------------------------------

function driveCodex(outDir) {
  const projectDir = mkdtempSync(path.join(PRIVATE_ROOT, "fixtures-codex-"));
  const codexHome = mkdtempSync(path.join(PRIVATE_ROOT, "codex-home-"));
  writeFileSync(path.join(codexHome, "hooks.json"), JSON.stringify(claudeShapeHooks(outDir), null, 2));

  // Keyless login (ADR-0012 "Codex" row + "Codex isolation"): a temp CODEX_HOME containing
  // only a symlink to the owner's existing auth.json, never an API key.
  const realAuth = path.join(os.homedir(), ".codex", "auth.json");
  if (existsSync(realAuth)) {
    symlinkSync(realAuth, path.join(codexHome, "auth.json"));
  }

  const args = [
    "exec",
    "--skip-git-repo-check",
    "--dangerously-bypass-hook-trust", // DECISIONS-r9 R6: exec-only, never interactive
    "-c",
    "sandbox_workspace_write.network_access=true", // R6: localhost fixtures need network
    "Run exactly one Bash command: echo gp3-fixture-probe. Then stop.",
  ];
  const r = spawnSync("codex", args, {
    cwd: projectDir,
    env: keylessEnv({ CODEX_HOME: codexHome }),
    encoding: "utf8",
    timeout: 120_000,
  });
  return { r, projectDir };
}

// --- normalize + install into e2e/fixtures ------------------------------------

function installFixtures(agent, outDir, projectDir) {
  const { ver } = AGENTS[agent];
  const destDir = path.join(REPO_ROOT, "e2e", "fixtures", agent, ver);
  mkdirSync(destDir, { recursive: true });
  const home = os.homedir();
  const written = [];
  for (const ev of EVENTS) {
    const src = path.join(outDir, `${ev}.json`);
    if (!existsSync(src)) continue;
    const raw = JSON.parse(readFileSync(src, "utf8"));
    const safe = normalize(raw, { home, proj: projectDir });
    // transcript_path still names the temp project dir inside a "<home>/.claude/projects/…"
    // segment after normalize()'s substring passes (DEVIATIONS.md row: grep gate forbids the
    // literal "/.claude/projects" substring in any fixture) — blank the whole field, the
    // smallest rule that removes it without touching normalize.mjs (not owned by this task).
    if (typeof safe.transcript_path === "string") safe.transcript_path = "<transcript_path>";
    writeFileSync(path.join(destDir, `${ev}.json`), `${JSON.stringify(safe, null, 2)}\n`);
    written.push(ev);
  }
  return { destDir, written };
}

// --- main ----------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);

  if (argv[0] === "--capture") {
    captureMode(argv[1], argv[2]);
    return;
  }

  const agent = argv[0];
  if (!AGENTS[agent]) {
    console.error(`usage: record-fixtures.mjs <claude-code|codex> | --capture <outdir> <event>`);
    process.exit(1);
  }

  mkdirSync(PRIVATE_ROOT, { recursive: true });
  const captureOutDir = mkdtempSync(path.join(PRIVATE_ROOT, `cap-${agent}-`));

  const { r, projectDir } =
    agent === "claude-code" ? driveClaudeCode(captureOutDir) : driveCodex(captureOutDir);

  const { destDir, written } = installFixtures(agent, captureOutDir, projectDir);

  console.log(
    JSON.stringify(
      {
        agent,
        exitCode: r.status,
        signal: r.signal,
        stderrTail: (r.stderr ?? "").slice(-2000),
        capturedEvents: written,
        destDir,
      },
      null,
      2
    )
  );
}

main();
