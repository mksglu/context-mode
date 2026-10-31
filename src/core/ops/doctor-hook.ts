// src/core/ops/doctor-hook.ts — ctx_doctor D5 hook round trip and its Codex trust sub-case.
// Spec: impl/07 §5 D5 + "D5 Codex trust sub-case", DECISIONS-r9 R6, DEVIATIONS D-M5-arch-4, D-M5-U1-6, D-M5-D3-1.
// D5 runs `hook.mjs --agent <id>` from the running server bundle's directory (D-M3-arch-3) with that agent's
// recorded payload from `<bundle>/fixtures/hook-roundtrip.json` on stdin, then checks the native shape and
// the hook's own cost against HOOK_P95_MS. An agent with no recorded payload is UNKNOWN, never a guessed payload.
// D-D5-BARE-1: the cost is hook wall minus bare `node -e ""` wall, the D3 rule (ADR-0019 D3), fastest of D5_SAMPLES pairs.
// node.exe start is paid by the host with or without the hook (42.7 ms p50 on windows-latest), so it is not in the budget.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { hostText } from "./host-text.ts";
import {
  AGENT_ARG, D5_CODEX_UNTRUSTED_DETAIL, D5_FIX, D5_NO_FIXTURE_DETAIL, D5_SHAPE_DETAIL, D5_SLOW_DETAIL,
  DOCTOR_LABEL, DOCTOR_PASS_DETAIL, HOOK_ENTRY_FILE, HOOK_FIXTURE_DIR, HOOK_FIXTURE_FILE, HOOK_P95_MS,
  HOOK_TIMEOUT_MS, HOOKS_JSON_FILE,
} from "../contracts/constants.ts";
import type { AgentId } from "../contracts/agents.ts";
import type { DbHandle, DoctorRow } from "../contracts/types.ts";
import { runProcess } from "../sandbox/spawn.ts";

/** One recorded hook call (D-M5-arch-4): the native event name and the payload the host sent. */
interface FixtureEntry { event: string; payload: unknown; }

export interface HookCheckInput {
  agent: AgentId;
  bundleDir: string;                // directory of the running server bundle; hook.mjs and fixtures/ sit here
  env: Record<string, string>;      // env for the hook child (caller builds it)
  signal: AbortSignal;
  worktree?: string;                // the project worktree; the fixture's cwd, so the hook finds a repository (D-D5-FIXTURE-1)
  codexConfigDir: string;           // codex only: where hooks.json lives (CODEX_HOME or ~/.codex)
  db: DbHandle | null;              // codex only: this project's context.db, null when none exists yet
  now?: () => number;               // wall clock in ms; tests pin it, default performance.now
  samples?: number;                 // hook and bare-node pairs; the fastest of each is compared (default D5_SAMPLES)
  bareMs?: () => Promise<number>;   // one bare node wall in ms; tests pin it, default a real `node -e ""` run
}

const D5_SAMPLES = 3; // noise only adds time; a hook over budget is over it in every pair (D-CI-PERF-1)

const row = (status: DoctorRow["status"], detail: string, fixCommand?: string): DoctorRow =>
  fixCommand === undefined
    ? { id: "D5", label: DOCTOR_LABEL.D5, status, detail }
    : { id: "D5", label: DOCTOR_LABEL.D5, status, detail, fixCommand };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The agent's recorded payload, or null: no fixture file, unreadable JSON, or no key for this agent. */
function loadFixture(bundleDir: string, agent: AgentId): FixtureEntry | null {
  const file = path.join(bundleDir, HOOK_FIXTURE_DIR, HOOK_FIXTURE_FILE);
  if (!existsSync(file)) return null;
  let all: unknown;
  try {
    all = JSON.parse(hostText(readFileSync(file, "utf8")));
  } catch {
    return null;
  }
  if (!isObject(all) || !Object.hasOwn(all, agent)) return null;
  const e = all[agent];
  if (!isObject(e) || typeof e.event !== "string" || !Object.hasOwn(e, "payload")) return null;
  return { event: e.event, payload: e.payload };
}

/** The fixture payload with `cwd` set to the project worktree: a recorded /tmp/project is no repository and would log a hook error each run. */
function payloadFor(payload: unknown, worktree: string | undefined): unknown {
  return worktree !== undefined && isObject(payload) ? { ...payload, cwd: worktree } : payload;
}

/**
 * Native shape (D-M5-D3-1): exit 0 or 2, not killed, and stdout is either empty (allow) or one JSON object
 * whose `hookSpecificOutput.hookEventName` is the fixture's event. Both recorded agents (claude-code, codex)
 * answer in the Claude hook shape (adapters `encodeClaudeShape`).
 */
function isNativeShape(stdout: string, exitCode: number | null, killed: string | null, event: string): boolean {
  if (killed !== null || (exitCode !== 0 && exitCode !== 2)) return false;
  if (stdout.length === 0) return true;
  let out: unknown;
  try {
    out = JSON.parse(stdout);
  } catch {
    return false;
  }
  return isObject(out) && isObject(out.hookSpecificOutput) && out.hookSpecificOutput.hookEventName === event;
}

/** R6: true when at least one journal row of any Codex session exists in this project's context.db. */
export function codexHookJournaled(db: DbHandle | null): boolean {
  if (db === null) return false;
  return db.raw.prepare("SELECT 1 FROM events WHERE agent = ? LIMIT 1").get("codex") !== undefined;
}

/** D5 row. Never throws: a hook that cannot start is a FAIL on shape, a missing fixture is UNKNOWN. */
export async function checkHookRoundTrip(i: HookCheckInput): Promise<DoctorRow> {
  // Codex trust sub-case (R6): hooks file on disk but Codex never ran one -> the one-time trust step.
  if (i.agent === "codex" && existsSync(path.join(i.codexConfigDir, HOOKS_JSON_FILE)) && !codexHookJournaled(i.db)) {
    return row("UNKNOWN", D5_CODEX_UNTRUSTED_DETAIL);
  }
  const fixture = loadFixture(i.bundleDir, i.agent);
  if (fixture === null) return row("UNKNOWN", D5_NO_FIXTURE_DETAIL(i.agent));
  const now = i.now ?? (() => performance.now());
  const samples = Math.max(1, i.samples ?? D5_SAMPLES);
  const bareMs = i.bareMs ?? (async () => {
    const t = performance.now();
    await runProcess([process.execPath, "-e", ""], { cwd: i.bundleDir, env: i.env, signal: i.signal, timeoutMs: HOOK_TIMEOUT_MS });
    return performance.now() - t;
  });
  const hookWalls: number[] = [];
  const bareWalls: number[] = [];
  for (let n = 0; n < samples; n++) {
    const start = now();
    const r = await runProcess([process.execPath, path.join(i.bundleDir, HOOK_ENTRY_FILE), AGENT_ARG, i.agent], {
      cwd: i.bundleDir,
      env: i.env,
      signal: i.signal,
      timeoutMs: HOOK_TIMEOUT_MS,
      stdin: JSON.stringify(payloadFor(fixture.payload, i.worktree)),
    });
    hookWalls.push(now() - start);
    if (!isNativeShape(r.stdout.toString("utf8"), r.exitCode, r.killed, fixture.event)) return row("FAIL", D5_SHAPE_DETAIL, D5_FIX);
    bareWalls.push(await bareMs());
  }
  const ms = Math.max(0, Math.round(Math.min(...hookWalls) - Math.min(...bareWalls)));
  if (ms > HOOK_P95_MS) return row("FAIL", D5_SLOW_DETAIL(ms), D5_FIX);
  return row("PASS", DOCTOR_PASS_DETAIL);
}
