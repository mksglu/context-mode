// build/manifests.ts — manifest + hook config generation (docs/v2/impl/13-build-release.md §3; impl/10 §1.5;
// DECISIONS-r9 R1, R4; DEVIATIONS D-M3-arch-4, D-M3-A7-1..5). Build-time only: reads adapters/table.ts rows and
// writes files; never shipped as code. M6 adds the release-only part: `version` from plan.mjs via build.mjs --version
// (D-M6-arch-3, D-M6-B2-1); hashes are build/hash.mjs.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ADAPTERS, hasReplace } from "../src/adapters/table.ts";
import type { AgentId } from "../src/core/contracts/agents.ts";
import { KIRO_TOOL_MATCHERS, NODE_MIN, RELEASE_SUMS_FILE, SERVER_KEY } from "../src/core/contracts/constants.ts";
import type { AdapterRow } from "../src/core/contracts/types.ts";

// Build-tool literals (same rule as build.mjs DEFAULT_OUT/BUNDLES; DEVIATIONS D-M3-A7-5).
const DEV_VERSION = "0.0.0-dev"; // impl/13 §3.1 step 2: non-release builds
// D-PKG-META-1: the repo package.json is the one source of the shared release fields (description, keywords, license,
// homepage, bugs, repository). The release version comes from build.mjs --version; engines from NODE_MIN.
const DEV_PACKAGE_JSON = fileURLToPath(new URL("../package.json", import.meta.url));
interface DevMeta { description: string; keywords: string[]; license: string; homepage: string; bugs: JsonObject; repository: JsonObject }
function devMeta(): DevMeta {
  const pkg = JSON.parse(readFileSync(DEV_PACKAGE_JSON, "utf8")) as Record<string, unknown>;
  for (const key of ["description", "license", "homepage"]) {
    if (typeof pkg[key] !== "string" || pkg[key] === "") throw new Error("package.json: " + key + " must be a non-empty string");
  }
  if (!Array.isArray(pkg.keywords) || pkg.keywords.length === 0) throw new Error("package.json: keywords must be a non-empty array");
  for (const key of ["bugs", "repository"]) {
    if (pkg[key] === null || typeof pkg[key] !== "object" || Array.isArray(pkg[key])) throw new Error("package.json: " + key + " must be an object");
  }
  return pkg as unknown as DevMeta;
}
const NODE_COMMAND = "node";
const SERVER_BUNDLE = "server.mjs";
const HOOK_BUNDLE = "hook.mjs";
const AGENT_FLAG = "--agent";
const MS_PER_SECOND = 1000;
const OWN_TOOL_GLOB = "ctx_.*";
const MCP_ANY_GLOB = "mcp__.*";
const TOOL_EVENTS: readonly string[] = ["PreToolUse", "PostToolUse"]; // canonical events that carry the matcher
const HOOKS_DIR = "hooks";
// D-M3-F-5: Claude Code runs plugin hooks and the plugin MCP server with cwd = the user's project, so a bare
// "hook.mjs"/"server.mjs" is not found (live: MODULE_NOT_FOUND, server "failed"). The host expands this
// variable to the plugin dir in both places (v1 hooks.json and plugin.json used it the same way).
const PLUGIN_ROOT_VAR: Readonly<Partial<Record<AgentId, string>>> = { "claude-code": "${CLAUDE_PLUGIN_ROOT}", qwen: "${CLAUDE_PLUGIN_ROOT}" };
// D-FU-RM-QWEN-1: Qwen expands ${extensionPath} and ${/} in qwen-extension.json (server path), but in hook commands
// it replaces only ${CLAUDE_PLUGIN_ROOT}. So the server path and the hook command use different variables.
const SERVER_PATH_PREFIX: Readonly<Partial<Record<AgentId, string>>> = { qwen: "${extensionPath}${/}", gemini: "${extensionPath}${/}" };
// D-FU-RM-GEMINI-1: Gemini expands ${extensionPath} and ${/} in the manifest and in hook commands, and reads hooks only
// from <ext>/hooks/hooks.json. So its hook command names the extension path directly.
const HOOK_PATH_PREFIX: Readonly<Partial<Record<AgentId, string>>> = { gemini: "${extensionPath}${/}" };
const bundleArg = (row: AdapterRow, file: string): string => {
  const root = PLUGIN_ROOT_VAR[row.id];
  return root === undefined ? file : root + "/" + file;
};
const serverArg = (row: AdapterRow): string => {
  const prefix = SERVER_PATH_PREFIX[row.id];
  return prefix === undefined ? bundleArg(row, SERVER_BUNDLE) : prefix + SERVER_BUNDLE;
};
const bundleCmd = (row: AdapterRow, file: string): string => {
  const prefix = HOOK_PATH_PREFIX[row.id];
  if (prefix !== undefined) return '"' + prefix + file + '"';
  return PLUGIN_ROOT_VAR[row.id] === undefined ? file : '"' + bundleArg(row, file) + '"';
};

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

// impl/13 §3.1 step 5 (CI/build code: regex allowed).
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// D-M2-MCP-1: on a row with a replace channel the PostToolUse matcher also names every MCP tool, so a large
// non-ctx MCP result reaches the replace path. PreToolUse keeps the narrow matcher (no extra hook spawn).
export function buildMatcher(row: AdapterRow, event?: string): string {
  const names = Object.values(row.nativeTools).flat();
  const alts = [...names, escapeRegExp(row.toolNamePrefix) + OWN_TOOL_GLOB];
  if (event === "PostToolUse" && hasReplace(row)) alts.push(MCP_ANY_GLOB);
  return `^(${alts.join("|")})$`;
}

const hookCommand = (row: AdapterRow): string => [NODE_COMMAND, bundleCmd(row, HOOK_BUNDLE), AGENT_FLAG, row.id].join(" ");
const seconds = (row: AdapterRow): number => row.hookTimeoutMs / MS_PER_SECOND;
const command = (row: AdapterRow): JsonObject => ({ type: "command", command: hookCommand(row) });
const events = (row: AdapterRow): [string, string][] => Object.entries(row.eventMap) as [string, string][];
const isToolEvent = (canonical: string): boolean => TOOL_EVENTS.includes(canonical);

// {hooks:{<Event>:[{matcher?,hooks:[{type,command,timeout}]}]}} — Claude shape (claude-code, codex, qwen) and gemini.
function nestedShape(row: AdapterRow, timeout: number, withMatcher: boolean, cmd: JsonObject = command(row)): JsonObject {
  const hooks: JsonObject = {};
  for (const [canonical, native] of events(row)) {
    const group: JsonObject = { hooks: [{ ...cmd, timeout }] };
    if (withMatcher && isToolEvent(canonical)) group.matcher = buildMatcher(row, native);
    hooks[native] = [group];
  }
  return { hooks };
}

// {version:1,hooks:{<Event>:[{type,command,<timeoutKey>}]}} — copilot-cli (timeoutSec), vscode (timeout).
function flatShape(row: AdapterRow, timeoutKey: string): JsonObject {
  const hooks: JsonObject = {};
  for (const [, native] of events(row)) hooks[native] = [{ ...command(row), [timeoutKey]: seconds(row) }];
  return { version: 1, hooks };
}

// {version:"v1",hooks:[{name,trigger,matcher,action:{type,command},timeout,enabled}]} — kiro.
function kiroShape(row: AdapterRow): JsonObject {
  const hooks: Json[] = events(row).flatMap(([canonical, native]) => {
    const entry: JsonObject = { name: SERVER_KEY + "-" + native, trigger: native, action: command(row), timeout: seconds(row), enabled: true };
    if (!isToolEvent(canonical)) return [entry];
    return KIRO_TOOL_MATCHERS.map(([matcher, tag]) => ({ ...entry, name: SERVER_KEY + "-" + native + "-" + tag, matcher }));
  });
  return { version: "v1", hooks };
}

// {hooks:{enabled:true,events:{<Event>:[{matcher?,hooks:[{type,command,timeoutMs}]}]}}} — zcode matcher groups
// (ZCode CLI docs usage/09-hooks.md, zcode.z.ai/en/docs/hooks; D-HF-ZCODE-SHAPE-1).
function zcodeShape(row: AdapterRow): JsonObject {
  const byEvent: JsonObject = {};
  for (const [canonical, native] of events(row)) {
    const group: JsonObject = { hooks: [{ ...command(row), timeoutMs: row.hookTimeoutMs }] };
    if (isToolEvent(canonical)) group.matcher = buildMatcher(row, native);
    byEvent[native] = [group];
  }
  return { hooks: { enabled: true, events: byEvent } };
}

// impl/10 §1.5: one host hook shape per spawn agent; pi/opencode are in-process (no file). DEVIATIONS D-M3-A7-2.
const HOOK_SHAPES: Readonly<Record<AgentId, ((row: AdapterRow) => JsonObject) | null>> = {
  "claude-code": (row) => nestedShape(row, seconds(row), true),
  codex: (row) => nestedShape(row, seconds(row), true),
  gemini: (row) => nestedShape(row, row.hookTimeoutMs, false),
  qwen: (row) => nestedShape(row, seconds(row), true),
  "copilot-cli": (row) => flatShape(row, "timeoutSec"),
  vscode: (row) => flatShape(row, "timeout"),
  kiro: kiroShape,
  zcode: zcodeShape,
  pi: null,
  opencode: null,
};

// D-FU-RM-GEMINI-1: Gemini reads only hooks/hooks.json; every other host reads hooks/<id>.json.
const GEMINI_HOOK_FILE = "hooks.json";
const hookFile = (row: AdapterRow): string => HOOKS_DIR + "/" + (row.id === "gemini" ? GEMINI_HOOK_FILE : row.id + ".json");

// D-HQ-SKILLS-2: the host's own rendered skills dir, relative to the plugin root (Claude Code plugins reference: ./ prefix).
const skillsDir = (row: AdapterRow): string => "./" + row.skillChannel.path;

function mcpManifest(row: AdapterRow, version: string): JsonObject {
  return {
    name: SERVER_KEY,
    version,
    description: devMeta().description,
    mcpServers: { [SERVER_KEY]: { command: NODE_COMMAND, args: [serverArg(row), AGENT_FLAG, row.id] } },
  };
}

// impl/13 §3.1 step 2 table, keyed by installMode. Returns [relative path, content] or null (no manifest file).
function manifestFor(row: AdapterRow, version: string): [string, JsonObject] | null {
  switch (row.installMode) {
    case "marketplace":
      return [".claude-plugin/plugin.json", { ...mcpManifest(row, version), hooks: "./" + hookFile(row), skills: skillsDir(row) }]; // D-M3-A7-3, D-HQ-SKILLS-2
    case "extension": // qwen reads config.hooks, a path relative to the extension (D-FU-RM-QWEN-1)
      return [row.id + "-extension.json", row.id === "qwen" ? { ...mcpManifest(row, version), hooks: hookFile(row) } : mcpManifest(row, version)];
    case "plugin":
      return ["copilot/plugin.json", mcpManifest(row, version)];
    case "config-mcp": // codex: ctx_upgrade writes config.toml (A2, tools-ops)
    case "mcp-entry":
    case "hooks+mcp":
    case "in-process":
      return null;
    default:
      throw new Error("manifest: unknown installMode " + (row as { installMode: string }).installMode);
  }
}

// ADR-0019 Owner decisions D1 (PO-NPM-2): the out tree is the npm package. Its ONE package.json is the D1 shape:
// name, version, bin (no "./": npm 11 strips it), type, engines, files = the release tree, and the Pi key that
// D-FU-RM-PI-1 needs (Pi reads "pi".extensions/skills from the package dir). No dependencies, no scripts, no
// private: an npm or Pi install of the tree runs nothing.
// ADR-0023 (D-NI-CODEX-1): `codex plugin add context-mode@context-mode` installs the npm tarball and reads
// .codex-plugin/plugin.json from its root. Hooks name the bundle by ${PLUGIN_ROOT}; the server keeps the v1 form
// (cwd "." = plugin root, relative bundle path). Skills ship pre-rendered with the codex tool names.
const CODEX_PLUGIN_DIR = ".codex-plugin";
const CODEX_PLUGIN_ROOT = "${PLUGIN_ROOT}";
export const CODEX_PLUGIN_SKILLS = "codex/skills";
function codexPlugin(row: AdapterRow, version: string): [string, JsonObject][] {
  const hookCmd: JsonObject = { type: "command", command: [NODE_COMMAND, '"' + CODEX_PLUGIN_ROOT + "/" + HOOK_BUNDLE + '"', AGENT_FLAG, row.id].join(" ") };
  return [
    [CODEX_PLUGIN_DIR + "/plugin.json", {
      name: SERVER_KEY, version, description: devMeta().description,
      mcpServers: "./" + CODEX_PLUGIN_DIR + "/mcp.json", hooks: "./" + CODEX_PLUGIN_DIR + "/hooks.json", skills: "./" + CODEX_PLUGIN_SKILLS + "/",
      interface: { displayName: SERVER_KEY, category: "Productivity" },
    }],
    [CODEX_PLUGIN_DIR + "/mcp.json", { mcpServers: { [SERVER_KEY]: {
      command: NODE_COMMAND, args: ["./" + SERVER_BUNDLE, AGENT_FLAG, row.id], cwd: ".", default_tools_approval_mode: "approve" } } }],
    [CODEX_PLUGIN_DIR + "/hooks.json", nestedShape(row, seconds(row), true, hookCmd)],
  ];
}

const OUT_PACKAGE_JSON = "package.json";
const PI_EXTENSION = "./pi/index.js";
const PI_SKILLS = "./pi/skills"; // D-HQ-SKILLS-1: pi's own rendered copy
const OPENCODE_MAIN = "./opencode/plugin.js"; // ADR-0023 (D-NI-OPENCODE-1): OpenCode imports the plugin by package name
// D-OC2-SETUP-1: the OpenCode 2 loader resolves a package plugin through exports["./server"] (main alone finds no entry).
const OPENCODE_EXPORTS = { ".": OPENCODE_MAIN, "./server": OPENCODE_MAIN };
const CLI_BUNDLE = "cli.mjs";
const NODE_ENGINE = ">=" + NODE_MIN; // D1, the runtime check constant (D-PKG-META-1)

// D1 "files = the release tree": every top-level name build.mjs writes, except package.json (npm always packs it).
// build.mjs assertOutTree fails the build when the real tree and this list differ.
export const OUT_FILES: readonly string[] = [
  ".claude-plugin", CODEX_PLUGIN_DIR, "claude-code", CLI_BUNDLE, "codex", "copilot", "fixtures", "gemini-extension.json", HOOK_BUNDLE, HOOKS_DIR, "opencode", "pi",
  "qwen-extension.json", "run.mjs", "search.mjs", SERVER_BUNDLE, "skills", RELEASE_SUMS_FILE,
].slice().sort();
// D-RN-REPO-1: npm provenance rejects a publish (E422) unless repository.url names the source repo. This is the
// `npm pkg fix` form, so check-npm-tarball.mjs's "npm pkg fix is a no-op" gate still holds.
const REPOSITORY = { type: "git", url: "git+https://github.com/mksglu/context-mode.git" };
const OUT_PACKAGE_KEYS: readonly string[] = ["bin", "bugs", "description", "engines", "exports", "files", "homepage", "keywords", "license", "main", "name", "pi", "repository", "type", "version"];
const PI_KEYS: readonly string[] = ["extensions", "skills"];

function npmPackageJson(version: string): JsonObject {
  const meta = devMeta();
  return {
    name: SERVER_KEY, version, type: "module", bin: { [SERVER_KEY]: CLI_BUNDLE }, engines: { node: NODE_ENGINE },
    files: [...OUT_FILES], main: OPENCODE_MAIN, exports: OPENCODE_EXPORTS, pi: { extensions: [PI_EXTENSION], skills: [PI_SKILLS] },
    description: meta.description, keywords: [...meta.keywords], license: meta.license, homepage: meta.homepage, bugs: meta.bugs, repository: meta.repository,
  };
}

// Throws unless `pkg` is the D1 shape above (any extra key, e.g. dependencies, scripts or private, is a hard stop).
export function assertOutPackageJson(pkg: unknown): void {
  if (pkg === null || typeof pkg !== "object" || Array.isArray(pkg)) throw new Error("package.json: not an object");
  const obj = pkg as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!OUT_PACKAGE_KEYS.includes(key)) throw new Error("package.json: key " + key + " not allowed (ADR-0019 D1)");
  }
  for (const key of OUT_PACKAGE_KEYS) if (!(key in obj)) throw new Error("package.json: missing " + key);
  if (obj.name !== SERVER_KEY) throw new Error("package.json: name must be " + SERVER_KEY);
  if (typeof obj.version !== "string") throw new Error("package.json: version must be a string");
  if (obj.type !== "module") throw new Error("package.json: type must be module");
  if (JSON.stringify(obj.bin) !== JSON.stringify({ [SERVER_KEY]: CLI_BUNDLE })) throw new Error("package.json: bin must be {" + SERVER_KEY + ": " + CLI_BUNDLE + "}");
  if (JSON.stringify(obj.engines) !== JSON.stringify({ node: NODE_ENGINE })) throw new Error("package.json: engines must be {node: " + NODE_ENGINE + "}");
  if (JSON.stringify(obj.files) !== JSON.stringify(OUT_FILES)) throw new Error("package.json: files must be " + OUT_FILES.join(","));
  if (obj.main !== OPENCODE_MAIN) throw new Error("package.json: main must be " + OPENCODE_MAIN);
  if (JSON.stringify(obj.exports) !== JSON.stringify(OPENCODE_EXPORTS)) throw new Error("package.json: exports must be " + JSON.stringify(OPENCODE_EXPORTS));
  if (JSON.stringify(obj.repository) !== JSON.stringify(REPOSITORY)) throw new Error("package.json: repository must be " + JSON.stringify(REPOSITORY));
  const meta = devMeta(); // D-PKG-META-1: the shared fields must equal the repo package.json
  for (const key of ["description", "keywords", "license", "homepage", "bugs"] as const) {
    if (JSON.stringify(obj[key]) !== JSON.stringify(meta[key])) throw new Error("package.json: " + key + " must equal the repo package.json " + key);
  }
  const pi = obj.pi;
  if (pi === null || typeof pi !== "object" || Array.isArray(pi)) throw new Error("package.json: pi must be an object");
  const piObj = pi as Record<string, unknown>;
  const piKeys = Object.keys(piObj).sort();
  if (piKeys.join(",") !== PI_KEYS.join(",")) throw new Error("package.json: pi keys must be " + PI_KEYS.join(","));
  if (JSON.stringify(piObj.extensions) !== JSON.stringify([PI_EXTENSION])) throw new Error("package.json: pi.extensions must be [" + PI_EXTENSION + "]");
  if (JSON.stringify(piObj.skills) !== JSON.stringify([PI_SKILLS])) throw new Error("package.json: pi.skills must be [" + PI_SKILLS + "]");
}

// impl/13 §3.1 step 3: alphabetical keys inside every object, array order kept.
function sortKeys(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  const out: JsonObject = {};
  for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
  return out;
}

function writeJson(outDir: string, rel: string, value: JsonObject): void {
  const file = path.join(outDir, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(sortKeys(value), null, 2) + "\n");
}

// `version` is plan.mjs's release version (build.mjs --version); no flag keeps DEV_VERSION (D-M6-arch-3, D-M6-B2-1).
// `rows` defaults to ADAPTERS; it exists only so tests can feed a bad row (DEVIATIONS D-M3-A7-4).
export function generateManifests(outDir: string, version: string = DEV_VERSION, rows: readonly AdapterRow[] = ADAPTERS): void {
  const files: [string, JsonObject][] = [];
  for (const row of rows) {
    const manifest = manifestFor(row, version);
    if (manifest !== null) files.push(manifest);
    if (row.installMode === "marketplace") { // D-INST-3: setup runs `claude plugin marketplace add <package dir>`
      files.push([".claude-plugin/marketplace.json", {
        name: SERVER_KEY, owner: { name: SERVER_KEY }, // Claude Code rejects a marketplace file without an owner object
        plugins: [{ name: SERVER_KEY, source: "./", description: devMeta().description, version, skills: skillsDir(row) }],
      }]);
    }
    if (row.id === "codex") files.push(...codexPlugin(row, version));
    const shape = HOOK_SHAPES[row.id];
    if (shape !== null) files.push([hookFile(row), shape(row)]);
  }
  if (rows.some((row) => row.id === "pi")) files.push([OUT_PACKAGE_JSON, npmPackageJson(version)]); // D-FU-RM-PI-1, ADR-0019 D1
  for (const [rel, value] of files) writeJson(outDir, rel, value);
}
