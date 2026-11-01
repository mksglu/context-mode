// e2e/harness/normalize.mjs
// Replaces volatile fields in a captured value with stable placeholders.
// Spec: docs/architecture/modules/14-tests.md §3, TECH-SPEC §6.4. Regex is allowed here
// (CI/test code only, per 00-architecture.md line 9 and Assumption A4).
// normalize() never throws and never mutates its input.

const ISO_TS = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\b/g;
const SID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g;

function toSlash(s) {
  return s.replace(/\\/g, "/");
}

function replacePid(s, pid) {
  if (!pid) return s;
  return s.replace(new RegExp(`\\b${pid}\\b`, "g"), "<pid>");
}

function replaceHomeAndProj(s, home, proj) {
  let out = s;
  if (home) out = out.split(home).join("<home>");
  if (proj) out = out.split(proj).join("<proj>");
  return out;
}

function replaceSid(s, sidMap) {
  return s.replace(SID_RE, (m) => {
    if (!sidMap.has(m)) sidMap.set(m, sidMap.size);
    return `<sid:${sidMap.get(m)}>`;
  });
}

function normalizeString(s, ctx) {
  let out = s;
  out = out.replace(ISO_TS, "<ts>");
  out = replacePid(out, ctx.pid);
  out = replaceHomeAndProj(out, ctx.home, ctx.proj);
  out = replaceSid(out, ctx.sidMap);
  out = toSlash(out);
  return out;
}

function isMsKey(key) {
  return typeof key === "string" && (key.endsWith("Ms") || key.endsWith("_ms"));
}

function walk(value, key, ctx) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return normalizeString(value, ctx);
  if (typeof value === "number") {
    if (isMsKey(key) && Number.isFinite(value)) return "<ms>";
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => walk(v, undefined, ctx));
  if (typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value)) out[k] = walk(value[k], k, ctx);
    return out;
  }
  return value;
}

/**
 * normalize(value, opts?) -> same shape, volatile fields replaced.
 * opts: { pid, home, proj } — optional hints for the pid/home/proj passes.
 * Never throws; input is never mutated.
 */
export function normalize(value, opts = {}) {
  try {
    const ctx = {
      pid: opts.pid ? String(opts.pid) : undefined,
      home: opts.home,
      proj: opts.proj,
      sidMap: new Map(),
    };
    return walk(value, undefined, ctx);
  } catch {
    return value;
  }
}
