// impl/03 §1, impl/00 §4 `// sandbox`, PRD §9: the child env is the parent env minus every
// Node/Bun/Deno preload-style variable, so NODE_OPTIONS and preload files never pass the direct child.

const NODE_PREFIX = "NODE_";
const OPTIONS_SUFFIX = "_OPTIONS";
// Step 2-4 named keys. NODE_OPTIONS is also caught by the prefix/suffix rule; it stays named for grep.
const STRIPPED_KEYS: readonly string[] = Object.freeze([
  "NODE_OPTIONS",
  "NODE_REPL_EXTERNAL_MODULE",
  "NODE_V8_COVERAGE",
  "BUN_OPTIONS",
  "DENO_OPTIONS",
]);

// Windows env names ignore case (`Node_Options` reaches node as NODE_OPTIONS), so the match is on
// the upper-case name on every OS (DEVIATIONS D-M2-R3-1).
function isStripped(key: string): boolean {
  const name = key.toUpperCase();
  if (STRIPPED_KEYS.includes(name)) return true;
  return name.startsWith(NODE_PREFIX) && name.endsWith(OPTIONS_SUFFIX);
}

/** Pure: copies `parent` (string values only), drops preload vars, then applies `extra` last. */
export function buildChildEnv(parent: NodeJS.ProcessEnv, extra?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of Object.keys(parent)) {
    const value = parent[key];
    if (value === undefined || isStripped(key)) continue;
    env[key] = value;
  }
  if (extra !== undefined) {
    for (const key of Object.keys(extra)) env[key] = extra[key];
  }
  return env;
}
