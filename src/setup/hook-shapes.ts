// src/setup/hook-shapes.ts
// ADR-0020: the one host hook shape per spawn agent (impl/10 §1.5), with the hook command given by the caller.
// build/manifests.ts writes these with the package-relative command; setup writes them with the absolute one.
// pi and opencode are in process (no file). Matcher text comes from composeMatcher (no regex is compiled here).
import { KIRO_TOOL_MATCHERS, SERVER_KEY } from "../core/contracts/constants.ts";
import type { AdapterRow, AgentId } from "../core/contracts/types.ts";
import { composeMatcher } from "../core/ops/doctor-config.ts";

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

const MS_PER_SECOND = 1000;
const TOOL_EVENTS: readonly string[] = ["PreToolUse", "PostToolUse"]; // canonical events that carry the matcher

const seconds = (row: AdapterRow): number => row.hookTimeoutMs / MS_PER_SECOND;
const entry = (cmd: string): JsonObject => ({ type: "command", command: cmd });
const events = (row: AdapterRow): [string, string][] => Object.entries(row.eventMap) as [string, string][];
const isToolEvent = (canonical: string): boolean => TOOL_EVENTS.includes(canonical);

// {hooks:{<Event>:[{matcher?,hooks:[{type,command,timeout}]}]}} — Claude shape (claude-code, codex, qwen) and gemini.
function nestedShape(row: AdapterRow, cmd: string, timeout: number, withMatcher: boolean): JsonObject {
  const hooks: JsonObject = {};
  for (const [canonical, native] of events(row)) {
    const group: JsonObject = { hooks: [{ ...entry(cmd), timeout }] };
    if (withMatcher && isToolEvent(canonical)) group.matcher = composeMatcher(row, native);
    hooks[native] = [group];
  }
  return { hooks };
}

// {version:1,hooks:{<Event>:[{type,command,powershell,<timeoutKey>}]}} — copilot-cli (timeoutSec), vscode (timeout).
// D-HW-PS-1: the Copilot harness runs `command` through PowerShell on Windows unless a `powershell` field is set
// (docs.github.com/en/copilot/reference/hooks-reference). PowerShell reads a leading quoted path as a string, so the
// explicit field starts with the call operator; sh and cmd.exe keep `command`.
const POWERSHELL_CALL = "& ";
function flatShape(row: AdapterRow, cmd: string, timeoutKey: string): JsonObject {
  const hooks: JsonObject = {};
  for (const [, native] of events(row)) hooks[native] = [{ ...entry(cmd), powershell: POWERSHELL_CALL + cmd, [timeoutKey]: seconds(row) }];
  return { version: 1, hooks };
}

// {version:"v1",hooks:[{name,trigger,matcher,action:{type,command},timeout,enabled}]} — kiro.
function kiroShape(row: AdapterRow, cmd: string): JsonObject {
  const hooks: Json[] = events(row).flatMap(([canonical, native]) => {
    const e: JsonObject = { name: SERVER_KEY + "-" + native, trigger: native, action: entry(cmd), timeout: seconds(row), enabled: true };
    if (!isToolEvent(canonical)) return [e];
    return KIRO_TOOL_MATCHERS.map(([matcher, tag]) => ({ ...e, name: SERVER_KEY + "-" + native + "-" + tag, matcher }));
  });
  return { version: "v1", hooks };
}

// {hooks:{enabled:true,events:{<Event>:[{matcher?,hooks:[{type,command,timeoutMs}]}]}}} — zcode matcher groups
// (ZCode CLI docs usage/09-hooks.md, zcode.z.ai/en/docs/hooks; D-HF-ZCODE-SHAPE-1).
function zcodeShape(row: AdapterRow, cmd: string): JsonObject {
  const byEvent: JsonObject = {};
  for (const [canonical, native] of events(row)) {
    const group: JsonObject = { hooks: [{ ...entry(cmd), timeoutMs: row.hookTimeoutMs }] };
    if (isToolEvent(canonical)) group.matcher = composeMatcher(row, native);
    byEvent[native] = [group];
  }
  return { hooks: { enabled: true, events: byEvent } };
}

export const HOOK_SHAPES: Readonly<Record<AgentId, ((row: AdapterRow, cmd: string) => JsonObject) | null>> = {
  "claude-code": (row, cmd) => nestedShape(row, cmd, seconds(row), true),
  codex: (row, cmd) => nestedShape(row, cmd, seconds(row), true),
  gemini: (row, cmd) => nestedShape(row, cmd, row.hookTimeoutMs, false),
  qwen: (row, cmd) => nestedShape(row, cmd, seconds(row), true),
  "copilot-cli": (row, cmd) => flatShape(row, cmd, "timeoutSec"),
  vscode: (row, cmd) => flatShape(row, cmd, "timeout"),
  kiro: kiroShape,
  zcode: zcodeShape,
  pi: null,
  opencode: null,
};
