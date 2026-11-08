// #1336 (D-R49-WEBFETCH-POLICY-1): the user policy file <data root>/policy.json. ADR-0008 item 6 promised an `allowHosts`
// list in it. Two settings, both for the WebFetch route only:
//   { "routes": { "webfetch": "off" }, "allowHosts": ["docs.example.com"] }
// routes.webfetch "off": every WebFetch goes to the host and the user's own hooks. allowHosts: hosts (exact name, lower
// case compare, no wildcard, no subdomain) whose WebFetch goes the same way. No regex. Read only for a WebFetch call.
// D-CI-PERF-3: node:fs through getBuiltinModule; a static ESM import of node:fs also loads fs/promises, readline and streams.
const { readFileSync } = process.getBuiltinModule("node:fs") as typeof import("node:fs");
import { join } from "node:path";
import { ROUTE_POLICY_FILE } from "../contracts/constants.ts";
import { dataRootOf, homeDirOf } from "../project/config-dir.ts";
import { hostText } from "../ops/host-text.ts";

export interface RoutePolicy { webfetchOff: boolean; allowHosts: readonly string[]; }
export type RoutePolicyRead =
  | { kind: "absent"; file: string; policy: RoutePolicy }
  | { kind: "bad"; file: string; policy: RoutePolicy; why: string }
  | { kind: "ok"; file: string; policy: RoutePolicy };

export const NO_ROUTE_POLICY: RoutePolicy = Object.freeze({ webfetchOff: false, allowHosts: Object.freeze([]) as readonly string[] });

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The policy file path, or "" when neither CONTEXT_MODE_DATA_DIR nor a home dir is known. */
export function routePolicyFile(env: NodeJS.ProcessEnv): string {
  const set = env.CONTEXT_MODE_DATA_DIR;
  const home = set !== undefined && set !== "" ? "" : homeDirOf(env);
  if (home === null) return "";
  return join(dataRootOf(env, home), ROUTE_POLICY_FILE);
}

function parse(doc: unknown): { policy: RoutePolicy } | { why: string } {
  if (!isObject(doc)) return { why: "the file is not a JSON object" };
  let off = false;
  const routes = doc.routes;
  if (routes !== undefined) {
    if (!isObject(routes)) return { why: "routes must be an object" };
    const w = routes.webfetch;
    if (w !== undefined && w !== "on" && w !== "off") return { why: 'routes.webfetch must be "on" or "off"' };
    off = w === "off";
  }
  let hosts: string[] = [];
  const list = doc.allowHosts;
  if (list !== undefined) {
    if (!Array.isArray(list) || !list.every((h) => typeof h === "string")) return { why: "allowHosts must be a list of host names" };
    hosts = (list as string[]).map((h) => h.trim().toLowerCase()).filter((h) => h !== "");
  }
  return { policy: { webfetchOff: off, allowHosts: hosts } };
}

/** Never throws. A missing file is no policy; an unreadable or invalid file is "bad" with no setting applied (WebFetch keeps its route). */
export function readRoutePolicy(env: NodeJS.ProcessEnv): RoutePolicyRead {
  const file = routePolicyFile(env);
  if (file === "") return { kind: "absent", file, policy: NO_ROUTE_POLICY };
  let text: string;
  try {
    text = hostText(readFileSync(file, "utf8"));
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ENOENT" ? { kind: "absent", file, policy: NO_ROUTE_POLICY } : { kind: "bad", file, policy: NO_ROUTE_POLICY, why: "the file cannot be read" };
  }
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { kind: "bad", file, policy: NO_ROUTE_POLICY, why: "the file is not valid JSON" };
  }
  const r = parse(doc);
  return "policy" in r ? { kind: "ok", file, policy: r.policy } : { kind: "bad", file, policy: NO_ROUTE_POLICY, why: r.why };
}

/** The host of a URL, lower case, or null when the URL does not parse. userinfo, port and path are not part of it. */
export function hostOfUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True when the URL's host equals one entry exactly. */
export function hostAllowed(url: string, hosts: readonly string[]): boolean {
  if (hosts.length === 0) return false;
  const h = hostOfUrl(url);
  return h !== null && h !== "" && hosts.includes(h);
}
