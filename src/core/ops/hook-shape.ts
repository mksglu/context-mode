// src/core/ops/hook-shape.ts — each host's own hook reply shape, and a tiny checker for it (D-HOST-SCHEMAS-1).
// tests/fixtures/host-schemas/<agent>.json holds what each host accepts on hook stdout, read from the host's
// own source (see each file's "source"). The adapter unit tests and doctor D5 check replies against the same files.
// The checker reads the JSON Schema keywords the fixtures use: type, enum, const, required, properties,
// additionalProperties, items, allOf, $ref (#/definitions/...). default, title, description, $schema and
// definitions are notes only. Any other keyword throws, so a fixture never uses a rule the checker skips.
import type { AgentId } from "../contracts/agents.ts";
import claudeCode from "../../../tests/fixtures/host-schemas/claude-code.json" with { type: "json" };
import codex from "../../../tests/fixtures/host-schemas/codex.json" with { type: "json" };
import gemini from "../../../tests/fixtures/host-schemas/gemini.json" with { type: "json" };
import qwen from "../../../tests/fixtures/host-schemas/qwen.json" with { type: "json" };
import copilotCli from "../../../tests/fixtures/host-schemas/copilot-cli.json" with { type: "json" };
import vscode from "../../../tests/fixtures/host-schemas/vscode.json" with { type: "json" };
import kiro from "../../../tests/fixtures/host-schemas/kiro.json" with { type: "json" };
import zcode from "../../../tests/fixtures/host-schemas/zcode.json" with { type: "json" };
import pi from "../../../tests/fixtures/host-schemas/pi.json" with { type: "json" };
import opencode from "../../../tests/fixtures/host-schemas/opencode.json" with { type: "json" };

type Schema = Readonly<Record<string, unknown>>;

/** One host's reply rules: stdout is JSON (default) or plain text, and the schema of each event's reply. */
export interface HostShape { stdout?: string; output: Readonly<Record<string, Schema>>; }

export const HOST_SHAPES: Readonly<Record<AgentId, HostShape>> = {
  "claude-code": claudeCode, codex, gemini, qwen, "copilot-cli": copilotCli, vscode, kiro, zcode, pi, opencode,
};

const NOTE_KEYS = new Set(["$schema", "title", "description", "definitions", "default"]);
const RULE_KEYS = new Set(["type", "enum", "const", "required", "properties", "additionalProperties", "items", "allOf", "$ref"]);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function hasType(v: unknown, t: string): boolean {
  if (t === "integer") return Number.isInteger(v);
  return typeOf(v) === t;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function resolve(root: Schema, ref: string): Schema {
  const parts = ref.split("/");
  if (parts[0] !== "#") throw new Error(`hook-shape: only local $ref is read, got ${ref}`);
  let at: unknown = root;
  for (const p of parts.slice(1)) at = isObject(at) ? at[p] : undefined;
  if (!isObject(at)) throw new Error(`hook-shape: $ref ${ref} names nothing`);
  return at;
}

/** Every place where `value` breaks `schema`; an empty list means the value is valid. */
export function shapeErrors(schema: Schema, value: unknown, root: Schema = schema, at = "$"): string[] {
  for (const k of Object.keys(schema)) {
    if (!NOTE_KEYS.has(k) && !RULE_KEYS.has(k)) throw new Error(`hook-shape: keyword ${k} at ${at} is not read by the checker`);
  }
  const errs: string[] = [];
  if (typeof schema.$ref === "string") errs.push(...shapeErrors(resolve(root, schema.$ref), value, root, at));
  if (Array.isArray(schema.allOf)) for (const s of schema.allOf) errs.push(...shapeErrors(s as Schema, value, root, at));
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => hasType(value, String(t)))) return [...errs, `${at}: ${typeOf(value)} is not ${types.join(" or ")}`];
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => same(e, value))) errs.push(`${at}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
  if (Object.hasOwn(schema, "const") && !same(schema.const, value)) errs.push(`${at}: ${JSON.stringify(value)} is not ${JSON.stringify(schema.const)}`);
  if (isObject(value)) {
    const props = isObject(schema.properties) ? schema.properties : {};
    if (Array.isArray(schema.required)) for (const r of schema.required) if (!Object.hasOwn(value, String(r))) errs.push(`${at}: ${String(r)} is required`);
    for (const [k, v] of Object.entries(value)) {
      if (Object.hasOwn(props, k)) errs.push(...shapeErrors(props[k] as Schema, v, root, `${at}.${k}`));
      else if (schema.additionalProperties === false) errs.push(`${at}: ${k} is not a known key`);
      else if (isObject(schema.additionalProperties)) errs.push(...shapeErrors(schema.additionalProperties, v, root, `${at}.${k}`));
    }
  }
  if (Array.isArray(value) && isObject(schema.items)) {
    const items = schema.items;
    value.forEach((v, n) => errs.push(...shapeErrors(items, v, root, `${at}[${n}]`)));
  }
  return errs;
}

/** What is wrong with one hook reply for this agent and canonical event; empty when the host accepts it. */
export function replyErrors(agent: AgentId, event: string, stdout: string): string[] {
  const host = HOST_SHAPES[agent];
  const schema = host.output[event];
  if (schema === undefined) return [`${agent} has no ${event} reply schema`];
  if (host.stdout === "text") return shapeErrors(schema, stdout);
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    return [`${agent} ${event}: stdout is not JSON`];
  }
  return shapeErrors(schema, value);
}
