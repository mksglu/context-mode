// src/core/ops/doctor-hook.ts — ctx_doctor D5 hook round trip and its Codex trust sub-case.
// Spec: impl/07 §5 D5 + "D5 Codex trust sub-case", DECISIONS-r9 R6, DEVIATIONS D-M5-arch-4, D-M5-U1-6, D-M5-D3-1.
// D5 runs `hook.mjs --agent <id>` from the running server bundle's directory (D-M3-arch-3) with that agent's
// recorded payload from `<bundle>/fixtures/hook-roundtrip.json` on stdin, then checks the native shape and
// the hook's own cost against HOOK_P95_MS. An agent with no recorded payload is UNKNOWN, never a guessed payload.
// D-D5-BARE-1: the cost is hook wall minus bare `node -e ""` wall, the D3 rule (ADR-0019 D3), fastest of 3 to 9 pairs (D-D5-MORE-PAIRS-1).
// node.exe start is paid by the host with or without the hook (42.7 ms p50 on windows-latest), so it is not in the budget.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { hostText } from "./host-text.ts";
import { replyErrors } from "./hook-shape.ts";
import {
  AGENT_ARG, D5_CODEX_UNTRUSTED_DETAIL, D5_FIX, D5_READ_MEDIA_DETAIL, D5_READ_OWN_DETAIL, D5_READ_RANGE_DETAIL, OUTPUT_CAP, D5_READ_SHAPE_DETAIL, REPLACE_TRIGGER_BYTES, D5_NO_FIXTURE_DETAIL, D5_SHAPE_DETAIL, D5_FIXTURE_FILE_ABSENT, D5_FIXTURE_PARSE, D5_FIXTURE_AGENT_ABSENT, D5_SLOW_DETAIL, D5_STOP_DETAIL, DATA_DIR_ENV, HOOK_ERROR_LOG_FILE,
  DOCTOR_LABEL, DOCTOR_PASS_DETAIL, HOOK_ENTRY_FILE, HOOK_FIXTURE_DIR, HOOK_FIXTURE_FILE, HOOK_P95_MS,
  HOOK_TIMEOUT_MS, HOOKS_JSON_FILE,
} from "../contracts/constants.ts";
import type { AgentId } from "../contracts/agents.ts";
import type { DbHandle, DoctorRow } from "../contracts/types.ts";
import { runProcess } from "../sandbox/spawn.ts";
import { nodeLaunch } from "../sandbox/host-node.ts";
import { CODEX_PLUGIN_ID, askPluginHooks, sameDir, untrustedPluginHooksDetail } from "../../setup/codex-trust.ts";
import { codexPluginHomeOf } from "../project/config-dir.ts";

/** One recorded hook call (D-M5-arch-4): the native event name and the payload the host sent. */
interface FixtureEntry { event: string; payload: unknown; }

export interface HookCheckInput {
  agent: AgentId;
  bundleDir: string;                // directory of the running server bundle; hook.mjs and fixtures/ sit here
  env: Record<string, string>;      // env for the hook child (caller builds it)
  signal: AbortSignal;
  worktree?: string;                // the project worktree; the fixture's cwd, so the hook finds a repository (D-D5-FIXTURE-1)
  codexConfigDir: string;           // codex only: the Codex home the server runs for (codexRunDirOf); hooks/list is asked for it
  db: DbHandle | null;              // codex only: this project's context.db, null when none exists yet
  now?: () => number;               // wall clock in ms; tests pin it, default performance.now
  samples?: number;                 // fixed number of hook and bare-node pairs; default: D5_MIN_PAIRS up to D5_MAX_PAIRS (D-D5-MORE-PAIRS-1)
  bareMs?: () => Promise<number>;   // one bare node wall in ms; tests pin it, default a real `node -e ""` run
  timeoutMs?: number;               // kill limit per hook and bare-node run; default HOOK_TIMEOUT_MS, the host limit (D-D5-TEST-TIMEOUT-1)
}

// Noise only adds time; a hook over budget is over it in every pair (D-CI-PERF-1). A noisy runner can slow the first pairs
// (macos-latest, tests in parallel: 94-162 ms over bare node, then 0-30 ms in a quiet pair). So pairs go on while the
// estimate is over the bound, up to D5_MAX_PAIRS. A really slow hook stays over the bound in every pair (D-D5-MORE-PAIRS-1).
const D5_MIN_PAIRS = 3;
const D5_MAX_PAIRS = 9;

// The terminal doctor prints the same fix (hook-registered): setup trusts our own plugin hooks.
const D5_CODEX_TRUST_FIX = "context-mode setup --agents codex";
// D-CODEX-HOME-RUN-1: the native plugin route, when Codex cannot vouch for our hooks in the plugin's home.
const D5_CODEX_ABSENT_DETAIL = (home: string): string => `codex is not on PATH, so the trust of the context-mode plugin hooks in ${home} is not known`;
const D5_CODEX_SILENT_DETAIL = (home: string): string => `codex app-server gave no hooks/list answer for ${home} in time, so the context-mode plugin hooks are not known to run`;
const D5_CODEX_OTHER_HOME_DETAIL = (asked: string, home: string): string => `codex answers for ${asked}, but the context-mode plugin runs from ${home}`;
const D5_CODEX_NONE_DETAIL = (home: string): string => `codex lists no context-mode plugin hooks in ${home}, so they do not run`;

const row = (status: DoctorRow["status"], detail: string, fixCommand?: string): DoctorRow =>
  fixCommand === undefined
    ? { id: "D5", label: DOCTOR_LABEL.D5, status, detail }
    : { id: "D5", label: DOCTOR_LABEL.D5, status, detail, fixCommand };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The agent's recorded payload, or the exact reason there is none (D-DOCTOR-ISSUE-1: every UNKNOWN names its cause). */
function loadFixture(bundleDir: string, agent: AgentId): FixtureEntry | { cause: string } {
  const file = path.join(bundleDir, HOOK_FIXTURE_DIR, HOOK_FIXTURE_FILE);
  if (!existsSync(file)) return { cause: D5_FIXTURE_FILE_ABSENT(file) };
  let all: unknown;
  try {
    all = JSON.parse(hostText(readFileSync(file, "utf8")));
  } catch (err) {
    return { cause: D5_FIXTURE_PARSE(file, err instanceof Error ? err.message : String(err)) };
  }
  if (!isObject(all)) return { cause: D5_FIXTURE_PARSE(file, "top level is not an object") };
  if (!Object.hasOwn(all, agent)) return { cause: D5_NO_FIXTURE_DETAIL(agent) + ": " + D5_FIXTURE_AGENT_ABSENT(file, Object.keys(all)) };
  const e = all[agent];
  if (!isObject(e) || typeof e.event !== "string" || !Object.hasOwn(e, "payload")) {
    return { cause: D5_NO_FIXTURE_DETAIL(agent) + ": the entry lacks an event name or a payload" };
  }
  return { event: e.event, payload: e.payload };
}

// D-D5-ALL-AGENTS-1: the payload key that carries the project dir. OpenCode's plugin sends `directory` (adapters/opencode.ts decode).
const CWD_KEY: Readonly<Record<AgentId, string>> = {
  "claude-code": "cwd", codex: "cwd", gemini: "cwd", qwen: "cwd", "copilot-cli": "cwd", vscode: "cwd", kiro: "cwd", zcode: "cwd", pi: "cwd", opencode: "directory",
};

/** The fixture payload with the agent's cwd key set to the project worktree: a recorded /tmp/project is no repository and would log a hook error each run. */
export function payloadFor(agent: AgentId, payload: unknown, worktree: string | undefined): unknown {
  return worktree !== undefined && isObject(payload) ? { ...payload, [CWD_KEY[agent]]: worktree } : payload;
}

/**
 * Native shape (D-M5-D3-1): exit 0 or 2, not killed, and stdout is empty (allow) or valid for the host's own reply schema
 * of the event (D-HOST-SCHEMAS-1: tests/fixtures/host-schemas/<agent>.json, the same files the adapter unit tests use).
 */
function isNativeShape(agent: AgentId, stdout: string, exitCode: number | null, killed: string | null, event: string): boolean {
  if (killed !== null || (exitCode !== 0 && exitCode !== 2)) return false;
  return stdout.length === 0 || replyErrors(agent, event, stdout).length === 0;
}

// D-D5-READ-SHAPE-1 (#1304): "D5 passes because the round trip does not check the shape of updatedToolOutput for Read".
// claude-code only: one PostToolUse Read call over REPLACE_TRIGGER_BYTES, in Claude Code's Read output shape (2.1.274 binary
// outputSchema), runs with HOME in a temp dir of its own, so the probe writes nothing to the user's store.
const READ_PROBE_LINES = 4 * Math.ceil(REPLACE_TRIGGER_BYTES / 40);

function readProbePayload(cwd: string, ranged: boolean): unknown {
  const content = Array.from({ length: READ_PROBE_LINES }, (_, n) => "d5 read probe line " + n + " ".padEnd(20, "x")).join("\n");
  const filePath = path.join(cwd, "d5-read-probe.txt");
  return {
    session_id: "d5-read-probe", transcript_path: "", cwd, hook_event_name: "PostToolUse", tool_name: "Read",
    tool_use_id: "toolu_d5_read_probe", tool_input: ranged ? { file_path: filePath, offset: 1, limit: READ_PROBE_LINES } : { file_path: filePath },
    tool_response: { type: "text", file: { filePath, content, numLines: READ_PROBE_LINES, startLine: 1, totalLines: READ_PROBE_LINES } },
  };
}

/** True when updatedToolOutput is absent (no replace) or is Read's own text object. */
export function isReadShape(stdout: string): boolean {
  if (stdout.trim() === "") return true;
  let out: unknown;
  try { out = JSON.parse(stdout); } catch { return false; }
  if (!isObject(out) || !isObject(out.hookSpecificOutput) || !Object.hasOwn(out.hookSpecificOutput, "updatedToolOutput")) return true;
  const r = out.hookSpecificOutput.updatedToolOutput;
  if (!isObject(r) || r.type !== "text" || !isObject(r.file)) return false;
  const f = r.file;
  return typeof f.filePath === "string" && typeof f.content === "string"
    && ["numLines", "startLine", "totalLines"].every((k) => typeof f[k] === "number");
}

// D-R41-READ-OFFSET-1 (#1314): a second probe sends the same Read with offset/limit; the hook must let it through whole.
async function readProbe(i: HookCheckInput, timeoutMs: number, ranged: boolean): Promise<string> {
  const home = mkdtempSync(path.join(tmpdir(), "cm-d5-read-"));
  try {
    const node = nodeLaunch({ ...i.env, HOME: home, USERPROFILE: home });
    const r = await runProcess([node.file, path.join(i.bundleDir, HOOK_ENTRY_FILE), AGENT_ARG, i.agent], {
      cwd: i.bundleDir, env: node.env, signal: i.signal, timeoutMs,
      stdin: JSON.stringify(readProbePayload(i.worktree ?? home, ranged)),
    });
    return r.stdout.toString("utf8");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

/** True when the hook gave no updatedToolOutput (the host's own result reaches the model). */
function isPassThrough(stdout: string): boolean {
  if (stdout.trim() === "") return true;
  let out: unknown;
  try { out = JSON.parse(stdout); } catch { return false; }
  return !isObject(out) || !isObject(out.hookSpecificOutput) || !Object.hasOwn(out.hookSpecificOutput, "updatedToolOutput");
}

// D-R47-READ-MEDIA-1 (#1321): a third probe sends a PreToolUse Read of a PNG over OUTPUT_CAP (real PNG signature);
// the hook must not deny it, Claude Code shows it as an image block.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function mediaProbe(i: HookCheckInput, timeoutMs: number): Promise<string> {
  const home = mkdtempSync(path.join(tmpdir(), "cm-d5-media-"));
  try {
    const filePath = path.join(home, "d5-media-probe.png");
    writeFileSync(filePath, Buffer.concat([PNG_SIGNATURE, Buffer.alloc(OUTPUT_CAP + 1)]));
    const node = nodeLaunch({ ...i.env, HOME: home, USERPROFILE: home });
    const r = await runProcess([node.file, path.join(i.bundleDir, HOOK_ENTRY_FILE), AGENT_ARG, i.agent], {
      cwd: i.bundleDir, env: node.env, signal: i.signal, timeoutMs,
      stdin: JSON.stringify({ session_id: "d5-media-probe", transcript_path: "", cwd: home, hook_event_name: "PreToolUse",
        tool_name: "Read", tool_use_id: "toolu_d5_media_probe", tool_input: { file_path: filePath } }),
    });
    return r.stdout.toString("utf8");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

// D-R48-OWN-FILE-1 (#1326): a fourth probe sends a PreToolUse Read of a skill reference over OUTPUT_CAP under a temp
// CLAUDE_CONFIG_DIR (skills/<skill>/references/*.md); the hook must not deny it. The temp dir is the probe's own.
async function ownProbe(i: HookCheckInput, timeoutMs: number): Promise<string> {
  const home = mkdtempSync(path.join(tmpdir(), "cm-d5-own-"));
  try {
    const cfg = path.join(home, ".claude");
    const refs = path.join(cfg, "skills", "d5-probe", "references");
    mkdirSync(refs, { recursive: true });
    const filePath = path.join(refs, "d5-own-probe.md");
    writeFileSync(filePath, "# d5 own probe\n".repeat(Math.ceil((OUTPUT_CAP + 1) / 15)));
    const node = nodeLaunch({ ...i.env, HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: cfg });
    const r = await runProcess([node.file, path.join(i.bundleDir, HOOK_ENTRY_FILE), AGENT_ARG, i.agent], {
      cwd: i.bundleDir, env: node.env, signal: i.signal, timeoutMs,
      stdin: JSON.stringify({ session_id: "d5-own-probe", transcript_path: "", cwd: home, hook_event_name: "PreToolUse",
        tool_name: "Read", tool_use_id: "toolu_d5_own_probe", tool_input: { file_path: filePath } }),
    });
    return r.stdout.toString("utf8");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

/** True when the hook's PreToolUse output says deny. */
function isDeny(stdout: string): boolean {
  if (stdout.trim() === "") return false;
  let out: unknown;
  try { out = JSON.parse(stdout); } catch { return false; }
  return isObject(out) && isObject(out.hookSpecificOutput) && out.hookSpecificOutput.permissionDecision === "deny";
}

/** null when all Read probes pass, else the FAIL detail. */
async function readProbeDetail(i: HookCheckInput, timeoutMs: number): Promise<string | null> {
  if (!isReadShape(await readProbe(i, timeoutMs, false))) return D5_READ_SHAPE_DETAIL;
  if (!isPassThrough(await readProbe(i, timeoutMs, true))) return D5_READ_RANGE_DETAIL;
  if (isDeny(await mediaProbe(i, timeoutMs))) return D5_READ_MEDIA_DETAIL;
  if (isDeny(await ownProbe(i, timeoutMs))) return D5_READ_OWN_DETAIL;
  return null;
}

/** #1333: ZCode sends the Claude PreToolUse shape and its Read shows png/jpeg/gif/webp as image blocks; D5 sends the media probe. */
async function mediaProbeDetail(i: HookCheckInput, timeoutMs: number): Promise<string | null> {
  return isDeny(await mediaProbe(i, timeoutMs)) ? D5_READ_MEDIA_DETAIL : null;
}

/** R6: true when at least one journal row of any Codex session exists in this project's context.db. */
export function codexHookJournaled(db: DbHandle | null): boolean {
  if (db === null) return false;
  return db.raw.prepare("SELECT 1 FROM events WHERE agent = ? LIMIT 1").get("codex") !== undefined;
}

/** A dir by its real path when it exists (Codex canonicalizes CODEX_HOME), else as given. */
function realDir(p: string): string {
  try { return realpathSync(p); } catch { return p; }
}

/** D-NI-CODEX-TRUST-3, D-CODEX-HOME-RUN-1: Codex's own word on our plugin hooks, asked for the home the server runs for
 *  (CODEX_HOME set in the app-server env). A row when that word decides D5, null when the round trip decides.
 *  The running bundle is the native plugin (it sits in <home>/plugins/cache): only a list from that home with every own
 *  hook trusted lets D5 go on; no Codex is UNKNOWN, no answer, another home or no own hook listed is FAIL.
 *  npm route (bundle elsewhere, hooks.json): an untrusted own hook is FAIL, anything else is no claim. */
async function codexPluginTrust(i: HookCheckInput): Promise<DoctorRow | null> {
  const home = i.codexConfigDir;
  const plugin = codexPluginHomeOf(i.bundleDir) !== null;
  const reply = await askPluginHooks({ ...i.env, CODEX_HOME: home }, CODEX_PLUGIN_ID, i.worktree ?? i.bundleDir);
  if (reply.kind === "list") {
    const detail = untrustedPluginHooksDetail(reply.hooks);
    if (detail !== undefined) return row("FAIL", detail, D5_CODEX_TRUST_FIX);
  }
  if (!plugin) return null;
  if (reply.kind === "absent") return row("UNKNOWN", D5_CODEX_ABSENT_DETAIL(home), D5_CODEX_TRUST_FIX);
  if (reply.kind === "silent") return row("FAIL", D5_CODEX_SILENT_DETAIL(home), D5_CODEX_TRUST_FIX);
  if (reply.codexHome !== undefined && !sameDir(realDir(reply.codexHome), realDir(home))) {
    return row("FAIL", D5_CODEX_OTHER_HOME_DETAIL(reply.codexHome, home), D5_CODEX_TRUST_FIX);
  }
  if (reply.hooks.length === 0) return row("FAIL", D5_CODEX_NONE_DETAIL(home), D5_CODEX_TRUST_FIX);
  return null;
}

/** D5 row. Never throws: a hook that cannot start is a FAIL on shape, a missing fixture is UNKNOWN. */
// D-1323-CODEX-STOP-1 (#1323): "codex: unknown hook event Stop" on each turn while D5 passed: D5 sent only PreToolUse.
// codex only: one Stop call with every field of Codex's rust-v0.166.0 stop.command.input schema. HOME and the data dir are a
// temp dir of its own, so the probe writes nothing to the user's store and a hook-errors.log line there is this call's own.
export function codexStopPayload(cwd: string): Record<string, unknown> {
  return {
    session_id: "d5-stop-probe", turn_id: "d5-stop-turn", transcript_path: null, cwd, hook_event_name: "Stop",
    model: "d5-probe", permission_mode: "default", stop_hook_active: false, last_assistant_message: "d5 stop probe",
  };
}

/** null when the Codex Stop probe gets an empty or Codex Stop reply and logs no hook error, else the FAIL detail. */
export async function codexStopDetail(i: HookCheckInput, timeoutMs: number): Promise<string | null> {
  const home = mkdtempSync(path.join(tmpdir(), "cm-d5-stop-"));
  try {
    const node = nodeLaunch({ ...i.env, HOME: home, USERPROFILE: home, [DATA_DIR_ENV]: home });
    const r = await runProcess([node.file, path.join(i.bundleDir, HOOK_ENTRY_FILE), AGENT_ARG, i.agent], {
      cwd: i.bundleDir, env: node.env, signal: i.signal, timeoutMs, stdin: JSON.stringify(codexStopPayload(i.worktree ?? home)),
    });
    const logged = existsSync(path.join(home, HOOK_ERROR_LOG_FILE));
    return !logged && isNativeShape(i.agent, r.stdout.toString("utf8"), r.exitCode, r.killed, "Stop") ? null : D5_STOP_DETAIL;
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

export async function checkHookRoundTrip(i: HookCheckInput): Promise<DoctorRow> {
  // D-NI-CODEX-TRUST-3: the native plugin route leaves no hooks.json, so the host is asked (hooks/list), as the terminal doctor does.
  // A hook Codex lists untrusted never runs, whatever hook.mjs answers here. No answer from Codex: no claim, the round trip decides.
  if (i.agent === "codex") {
    const trust = await codexPluginTrust(i);
    if (trust !== null) return trust;
  }
  // Codex trust sub-case (R6): hooks file on disk but Codex never ran one -> the one-time trust step.
  if (i.agent === "codex" && existsSync(path.join(i.codexConfigDir, HOOKS_JSON_FILE)) && !codexHookJournaled(i.db)) {
    return row("UNKNOWN", D5_CODEX_UNTRUSTED_DETAIL);
  }
  const fixture = loadFixture(i.bundleDir, i.agent);
  if ("cause" in fixture) return row("UNKNOWN", fixture.cause);
  const now = i.now ?? (() => performance.now());
  const fixed = i.samples === undefined ? null : Math.max(1, i.samples);
  const maxPairs = fixed ?? D5_MAX_PAIRS;
  const minPairs = fixed ?? D5_MIN_PAIRS;
  const timeoutMs = i.timeoutMs ?? HOOK_TIMEOUT_MS;
  const bareMs = i.bareMs ?? (async () => {
    const t = performance.now();
    const node = nodeLaunch(i.env);
    await runProcess([node.file, "-e", ""], { cwd: i.bundleDir, env: node.env, signal: i.signal, timeoutMs });
    return performance.now() - t;
  });
  const hookWalls: number[] = [];
  const bareWalls: number[] = [];
  let ms = 0;
  for (let n = 1; n <= maxPairs; n++) {
    const start = now();
    const node = nodeLaunch(i.env);
    const r = await runProcess([node.file, path.join(i.bundleDir, HOOK_ENTRY_FILE), AGENT_ARG, i.agent], {
      cwd: i.bundleDir,
      env: node.env,
      signal: i.signal,
      timeoutMs,
      stdin: JSON.stringify(payloadFor(i.agent, fixture.payload, i.worktree)),
    });
    hookWalls.push(now() - start);
    if (!isNativeShape(i.agent, r.stdout.toString("utf8"), r.exitCode, r.killed, fixture.event)) return row("FAIL", D5_SHAPE_DETAIL, D5_FIX);
    bareWalls.push(await bareMs());
    ms = Math.max(0, Math.round(Math.min(...hookWalls) - Math.min(...bareWalls)));
    if (n >= minPairs && ms <= HOOK_P95_MS) break;
  }
  if (ms > HOOK_P95_MS) return row("FAIL", D5_SLOW_DETAIL(ms), D5_FIX);
  const readDetail = i.agent === "claude-code" ? await readProbeDetail(i, timeoutMs)
    : i.agent === "zcode" ? await mediaProbeDetail(i, timeoutMs)
    : i.agent === "codex" ? await codexStopDetail(i, timeoutMs) : null;
  if (readDetail !== null) return row("FAIL", readDetail, D5_FIX);
  return row("PASS", DOCTOR_PASS_DETAIL);
}
