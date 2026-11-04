// D-NI-ZCODE-GATE-1: zcode 0.17.0 (zai-org/ZCode 3c5b2276, built from source, live with a fake local provider) reads
// ~/.zcode/cli/config.json through one zod schema (apps/zcode-cli/packages/adapters/src/config/schema.ts). One invalid key
// makes it log "config.file.invalid Config file failed to load" and use no key of the file: our hooks never run, and the
// file still parses as JSON. User-scope hooks need no workspace trust (only project zcode.json hooks do, 09-hooks.md).
// This file mirrors the schema for the keys that can sink the file. Doctor reads it and never writes a user's key.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { parseHostConfig } from "../core/ops/host-config.ts";
import { hostText } from "../core/ops/host-text.ts";

const OWN_AGENT = "zcode";
const EVENTS: readonly string[] = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "PostToolUse", "PostToolUseFailure", "Stop"];
const HOOK_TYPES: readonly string[] = ["process", "command"];

type Bad = { key: string; why: string } | undefined;
type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isPositive = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v) && v > 0;
const isText = (v: unknown): boolean => typeof v === "string" && v.length > 0;
const isTexts = (v: unknown): boolean => Array.isArray(v) && v.every((x) => typeof x === "string");

/** An optional key: absent is fine, present must pass `ok`. */
function field(o: Obj, at: string, name: string, ok: (v: unknown) => boolean, why: string): Bad {
  const v = o[name];
  return v === undefined || ok(v) ? undefined : { key: `${at}.${name}`, why };
}
function section(doc: Obj, name: string): { o?: Obj; bad?: Bad } {
  const v = doc[name];
  if (v === undefined) return {};
  return isObj(v) ? { o: v } : { bad: { key: name, why: "must be an object" } };
}
const oneOf = (allowed: readonly unknown[]) => (v: unknown): boolean => allowed.includes(v);
const isBool = (v: unknown): boolean => typeof v === "boolean";

function firstBad(...checks: Bad[]): Bad { return checks.find((c) => c !== undefined); }

function simple(doc: Obj, name: string, rules: [string, (v: unknown) => boolean, string][]): Bad {
  const s = section(doc, name);
  if (s.bad) return s.bad;
  if (!s.o) return undefined;
  return firstBad(...rules.map(([k, ok, why]) => field(s.o as Obj, name, k, ok, why)));
}

function hookBad(h: unknown, at: string): Bad {
  if (!isObj(h)) return { key: at, why: "must be an object" };
  if (!HOOK_TYPES.includes(h.type as string)) return { key: `${at}.type`, why: "must be process or command" };
  return firstBad(
    isText(h.command) ? undefined : { key: `${at}.command`, why: "must be a non-empty string" },
    field(h, at, "enabled", isBool, "must be a boolean"),
    field(h, at, "timeoutMs", isPositive, "must be a positive number"),
    field(h, at, "timeout", isPositive, "must be a positive number"),
    field(h, at, "async", isBool, "must be a boolean"),
    field(h, at, "args", isTexts, "must be an array of strings"),
    field(h, at, "statusMessage", isText, "must be a non-empty string"),
  );
}

const GROUP_KEYS: readonly string[] = ["matcher", "hooks"];
function groupBad(g: unknown, at: string): Bad {
  if (!isObj(g)) return { key: at, why: "must be an object" };
  const extra = Object.keys(g).find((k) => !GROUP_KEYS.includes(k));
  if (extra !== undefined) return { key: at, why: `has the unknown key ${extra}` };
  if (!Array.isArray(g.hooks) || g.hooks.length === 0) return { key: at, why: "needs a non-empty hooks array" };
  const m = field(g, at, "matcher", isText, "must be a non-empty string");
  if (m) return m;
  for (let i = 0; i < g.hooks.length; i++) { const b = hookBad(g.hooks[i], `${at}.hooks[${i}]`); if (b) return b; }
  return undefined;
}

const HOOK_ROOT_KEYS: readonly string[] = ["enabled", "timeoutMs", "maxOutputBytes", "events"];
function hooksBad(doc: Obj): Bad {
  const s = section(doc, "hooks");
  if (s.bad) return s.bad;
  const h = s.o;
  if (!h) return undefined;
  const extra = Object.keys(h).find((k) => !HOOK_ROOT_KEYS.includes(k));
  if (extra !== undefined) return { key: `hooks.${extra}`, why: "is not a hooks key" };
  const root = firstBad(field(h, "hooks", "enabled", isBool, "must be a boolean"), field(h, "hooks", "timeoutMs", isPositive, "must be a positive number"), field(h, "hooks", "maxOutputBytes", isPositive, "must be a positive number"));
  if (root || h.events === undefined) return root;
  if (!isObj(h.events)) return { key: "hooks.events", why: "must be an object" };
  for (const [ev, groups] of Object.entries(h.events)) {
    if (!EVENTS.includes(ev)) return { key: `hooks.events.${ev}`, why: "is not a zcode hook event" };
    if (!Array.isArray(groups)) return { key: `hooks.events.${ev}`, why: "must be an array of matcher groups" };
    for (let i = 0; i < groups.length; i++) { const b = groupBad(groups[i], `hooks.events.${ev}[${i}]`); if (b) return b; }
  }
  return undefined;
}

/** The first key zcode's schema rejects in this config.json (undefined: the schema accepts the keys checked here). */
export function zcodeSchemaBad(doc: unknown): Bad {
  if (!isObj(doc)) return { key: "(root)", why: "must be a JSON object" };
  return firstBad(
    simple(doc, "modelStream", [["idleTimeoutMs", isPositive, "must be a positive number"]]),
    simple(doc, "permission", [["mode", oneOf(["plan", "build", "edit", "yolo", "guarded", "auto"]), "must be plan, build, edit, yolo, guarded or auto"], ["allowedTools", isTexts, "must be an array of strings"], ["disallowedTools", isTexts, "must be an array of strings"], ["autoApproveHighRisk", isBool, "must be a boolean"], ["allowMediumRiskInAuto", isBool, "must be a boolean"]]),
    simple(doc, "features", ["compact", "rewind", "subagent", "memory", "skill", "mcp"].map((k): [string, (v: unknown) => boolean, string] => [k, isBool, "must be a boolean"])),
    simple(doc, "memory", [["use", isBool, "must be a boolean"]]),
    simple(doc, "logging", [["level", oneOf(["debug", "info", "warn", "error"]), "must be debug, info, warn or error"], ["format", oneOf(["text", "json"]), "must be text or json"]]),
    simple(doc, "ui", [["locale", oneOf(["auto", "en-US", "zh-CN"]), "must be auto, en-US or zh-CN"], ["theme", oneOf(["auto", "dark", "light"]), "must be auto, dark or light"]]),
    simple(doc, "toolConcurrency", [["maxConcurrency", isPositive, "must be a positive number"]]),
    hooksBad(doc),
  );
}

/** One line (what stops the hooks, and the fix), or undefined when zcode would load the file. */
export function zcodeConfigGate(home: string): string | undefined {
  const file = path.join(home, ".zcode", "cli", "config.json");
  if (!existsSync(file)) return undefined;
  let doc: unknown;
  try { doc = parseHostConfig(OWN_AGENT, file, hostText(readFileSync(file, "utf8")), "json"); }
  catch { return undefined; } // an unreadable file is reported by the parse check
  const bad = zcodeSchemaBad(doc);
  if (!bad) return undefined;
  return `${file}: ${bad.key} ${bad.why}, so zcode drops the whole config.json and runs no context-mode hook; fix or remove that key`;
}
