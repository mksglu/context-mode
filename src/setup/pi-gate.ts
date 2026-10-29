// D-NI-PI-GATE-1: conditions under which pi 1.4.0 lists the context-mode package but loads none of its hooks (live, temp
// HOME, fake OpenAI-compatible model; `pi list` showed the package in each case, the model got the full 208 KB file):
//   - the packages[] entry carries an extensions filter that leaves out pi/index.js: [] , "!pi/*", "!pi/index.js",
//     "-pi/index.js", an include list without it, ["**", "!pi/index.js"] (dist/core/package-manager.js applyPatterns);
//   - the same filter in <cwd>/.pi/settings.json, which replaces the user entry once the project is trusted
//     (trust.json nearest entry, else defaultProjectTrust "always"; "ask" has no answer in print mode, so it is untrusted).
// Doctor and setup only read these files; they never write a user's filter.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import { PI_PACKAGES_KEY, PI_PACKAGE_SOURCE_KEY, SERVER_KEY, SETTINGS_FILE } from "../core/contracts/constants.ts";
import { hostConfigValueAt, parseHostConfig } from "../core/ops/host-config.ts";
import { hostText } from "../core/ops/host-text.ts";
import { piAgentDirOf } from "../core/project/config-dir.ts";

const OWN_FILE = "pi/index.js";
const EXTENSIONS_KEY = "extensions";
const PROJECT_DIR = ".pi";
const TRUST_FILE = "trust.json";
const ALWAYS = "always";
const SOURCE_PREFIXES = ["npm:", "git:"];

type Env = Record<string, string | undefined>;
interface Source { file: string; doc: unknown }

function load(file: string): Source | undefined {
  if (!existsSync(file)) return undefined;
  try { return { file, doc: parseHostConfig("pi", file, hostText(readFileSync(file, "utf8")), "json") }; }
  catch { return undefined; } // an unreadable file is the host's to report; the gate stays silent
}

const real = (p: string): string => { try { return realpathSync(p); } catch { return path.resolve(p); } };

/** Last path segment of a packages[] source without a scheme, a @version/@ref or .git: "git:github.com/a/context-mode@release" -> "context-mode". */
function sourceName(source: string): string {
  let s = source;
  for (const p of SOURCE_PREFIXES) if (s.startsWith(p)) s = s.slice(p.length);
  const last = s.split("/").pop() ?? "";
  const at = last.indexOf("@", 1);
  const name = at > 0 ? last.slice(0, at) : last;
  return name.endsWith(".git") ? name.slice(0, -4) : name;
}

function isOwn(source: unknown, pkgDir: string): boolean {
  if (typeof source !== "string") return false;
  return real(source) === real(pkgDir) || sourceName(source) === SERVER_KEY;
}

interface Entry { source: Source; patterns: string[] | undefined }

/** The packages[] entries of one settings file that name context-mode, with their extensions patterns (undefined: no filter). */
function ownEntries(src: Source, pkgDir: string): Entry[] {
  const list = hostConfigValueAt(src.doc, [PI_PACKAGES_KEY]);
  if (!Array.isArray(list)) return [];
  const out: Entry[] = [];
  for (const e of list) {
    const obj = typeof e === "object" && e !== null && !Array.isArray(e) ? e as Record<string, unknown> : undefined;
    if (!isOwn(obj ? obj[PI_PACKAGE_SOURCE_KEY] : e, pkgDir)) continue;
    const ext = obj?.[EXTENSIONS_KEY];
    out.push({ source: src, patterns: Array.isArray(ext) ? ext.filter((x): x is string => typeof x === "string") : undefined });
  }
  return out;
}

function matchesAny(patterns: string[], pkgDir: string): boolean {
  const abs = path.join(pkgDir, OWN_FILE).split(path.sep).join("/");
  return patterns.some((p) => {
    const g = p.startsWith("./") ? p.slice(2) : p;
    return [OWN_FILE, path.posix.basename(OWN_FILE), abs].some((c) => path.posix.matchesGlob(c, g));
  });
}

const exactAny = (patterns: string[], pkgDir: string): boolean => {
  const abs = path.join(pkgDir, OWN_FILE).split(path.sep).join("/");
  return patterns.some((p) => { const g = p.startsWith("./") ? p.slice(2) : p; return g === OWN_FILE || g === abs; });
};

/** pi applyPatterns for the one file pi/index.js: plain patterns include, "!" excludes, "+" forces in, "-" forces out. An empty list loads nothing. */
function loads(patterns: string[], pkgDir: string): boolean {
  if (patterns.length === 0) return false;
  const by = (c: string): string[] => patterns.filter((p) => p.startsWith(c)).map((p) => p.slice(1));
  const includes = patterns.filter((p) => !"+-!".includes(p[0] ?? ""));
  let on = includes.length === 0 || matchesAny(includes, pkgDir);
  if (matchesAny(by("!"), pkgDir)) on = false;
  if (exactAny(by("+"), pkgDir)) on = true;
  if (exactAny(by("-"), pkgDir)) on = false;
  return on;
}

/** trust.json nearest entry for cwd (keys compared by real path, as pi canonicalizes), else defaultProjectTrust "always". */
function projectTrusted(agentDir: string, userDoc: unknown, cwd: string): boolean {
  const trust = load(path.join(agentDir, TRUST_FILE));
  const entries = new Map<string, unknown>();
  if (trust && typeof trust.doc === "object" && trust.doc !== null) for (const [k, v] of Object.entries(trust.doc)) entries.set(real(k), v);
  let dir = real(cwd);
  for (;;) {
    const v = entries.get(dir);
    if (v === true || v === false) return v;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return hostConfigValueAt(userDoc, ["defaultProjectTrust"]) === ALWAYS;
}

/** One line (what stops the hooks, and the fix), or undefined when no setting gates our extension. */
export function piSettingsGate(env: Env, home: string, pkgDir: string, cwd: string): string | undefined {
  const agentDir = piAgentDirOf(env as NodeJS.ProcessEnv, home);
  const user = load(path.join(agentDir, SETTINGS_FILE));
  const project = load(path.join(cwd, PROJECT_DIR, SETTINGS_FILE));
  const projectOwn = project && projectTrusted(agentDir, user?.doc, cwd) ? ownEntries(project, pkgDir) : [];
  // A trusted project entry replaces the user entry for the same package.
  const effective = projectOwn.length ? projectOwn : user ? ownEntries(user, pkgDir) : [];
  for (const e of effective) {
    if (e.patterns !== undefined && !loads(e.patterns, pkgDir)) {
      return `${e.source.file}: the packages[] entry for context-mode has extensions ${JSON.stringify(e.patterns)}, which leaves out ${OWN_FILE}, so pi loads no hook; remove the "extensions" filter from that entry`;
    }
  }
  return undefined;
}
