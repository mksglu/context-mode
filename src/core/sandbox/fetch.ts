// impl/03 §6, impl/05 §4, TECH-SPEC GP5 (proxy env, SSRF per hop), DECISIONS-r3 Q19, DECISIONS-r4 A8/A52/B57,
// DEVIATIONS D-M2-T5-2, D-1403-PROXY-NOT-TARGET-1, D-SSRF-FAKEIP-1. One path: resolve the URL's own host and check every address on
// every hop (with or without a proxy), connect to the checked address or to the proxy the environment names (no second
// DNS lookup of the target), follow redirects as new hops.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import type { Socket } from "node:net";
import { join } from "node:path";
import { connect as tlsConnect } from "node:tls";
import { D1_PACKAGE_FILE, FETCH_MAX_HOPS } from "../contracts/constants.ts";
import { CtxError } from "../contracts/errors.ts";
import { ownBundleDir } from "../ops/bundle-dir.ts";

// impl/03 §6 step 3 / "Constants used": fixed protocol data, not tunable, written inline.
const PRIVATE_RANGES: ReadonlyArray<readonly [string, number, "ipv4" | "ipv6"]> = [
  ["127.0.0.0", 8, "ipv4"],
  ["10.0.0.0", 8, "ipv4"],
  ["172.16.0.0", 12, "ipv4"],
  ["192.168.0.0", 16, "ipv4"],
  ["169.254.0.0", 16, "ipv4"],
  ["0.0.0.0", 8, "ipv4"], // D-SSRF-RANGES-1: "this network", not only 0.0.0.0
  ["100.64.0.0", 10, "ipv4"], // D-SSRF-RANGES-1: shared address space (RFC 6598), cloud metadata lives here
  ["198.18.0.0", 15, "ipv4"], // D-SSRF-RANGES-1: benchmark networks (RFC 2544)
  ["240.0.0.0", 4, "ipv4"], // D-SSRF-RANGES-1: reserved and broadcast
  ["::1", 128, "ipv6"],
  ["::", 128, "ipv6"],
  ["::", 96, "ipv6"], // D-SSRF-RANGES-1: IPv4-compatible (::a.b.c.d), deprecated, never a public origin
  ["64:ff9b:1::", 48, "ipv6"], // D-SSRF-RANGES-1: local-use NAT64 (RFC 8215)
  ["fc00::", 7, "ipv6"],
  ["fe80::", 10, "ipv6"],
  ["fec0::", 10, "ipv6"], // D-SSRF-RANGES-1: site-local (RFC 3879)
];
const BLOCKED = new BlockList();
for (const [net, prefix, type] of PRIVATE_RANGES) BLOCKED.addSubnet(net, prefix, type);

// D-SSRF-FAKEIP-1 (#1403): a Fake-IP DNS (Mihomo, OpenClash, Clash) answers every name with an address in the RFC 2544
// pool. The guard learns this once per process: it resolves a random name under .invalid, which RFC 6761 says never
// resolves. A normal resolver answers NXDOMAIN; only an answer inside the pool turns on the exemption, and it covers
// DNS-resolved names in the pool only. IP literals and every other range stay blocked.
const FAKE_IP_POOL = new BlockList();
FAKE_IP_POOL.addSubnet("198.18.0.0", 15, "ipv4");
const FAKE_IP_PROBE_TLD = ".invalid";
const FAKE_IP_PROBE_BYTES = 8;
const FAKE_IP_PROBE_MS = 1500;
let fakeIpProbe: Promise<boolean> | undefined;

function inFakeIpPool(address: string): boolean {
  return isIP(address) === 4 && FAKE_IP_POOL.check(address, "ipv4");
}

// One shared probe per process, started only when a name resolves into the pool. A timeout or an error is "no".
function fakeIpResolver(): Promise<boolean> {
  fakeIpProbe ??= new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), FAKE_IP_PROBE_MS);
    timer.unref();
    lookup(randomBytes(FAKE_IP_PROBE_BYTES).toString("hex") + FAKE_IP_PROBE_TLD, { all: true }).then(
      (addrs) => resolve(addrs.length > 0 && addrs.every((a) => inFakeIpPool(a.address))),
      () => resolve(false),
    ).finally(() => clearTimeout(timer));
  });
  return fakeIpProbe;
}

// RFC 9110 status classes (fixed protocol data, D-M2-T5-2).
const STATUS_OK_FIRST = 200;
const STATUS_OK_END = 300;
const STATUS_REDIRECT: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

// D-1380-FETCH-UA-1 (#1380): every request names itself, as v1's undici fetch did (user-agent and accept). Some
// hosts (en.wikipedia.org) answer 403 to a request with no user-agent. The version comes once from the bundle's
// package.json; the dev tree has none, so it is "dev".
const UA_HOME = "https://github.com/mksglu/context-mode";
const UA_DEV_VERSION = "dev";
let namedHeaders: Readonly<Record<string, string>> | undefined;
function baseHeaders(): Readonly<Record<string, string>> {
  if (namedHeaders === undefined) {
    let version = UA_DEV_VERSION;
    try {
      const v: unknown = JSON.parse(readFileSync(join(ownBundleDir(), D1_PACKAGE_FILE), "utf8")).version;
      if (typeof v === "string" && v !== "") version = v;
    } catch {
      // no package.json next to the bundle: the dev tree
    }
    namedHeaders = Object.freeze({ "user-agent": "context-mode/" + version + " (+" + UA_HOME + ")", accept: "*/*" });
  }
  return namedHeaders;
}

type Target = { host: string; port: number; address: string };
type Proxy = { url: URL; auth: string | undefined };

function fail(code: string | number): CtxError {
  return new CtxError("FETCH_FAILED", { code });
}

// Low-level code only: never the message or the stack (#1135, #1172).
function causeCode(err: unknown): string {
  if (err instanceof CtxError) return "";
  const e = err as { code?: unknown; name?: unknown; errors?: unknown[] } | null;
  if (e && typeof e.code === "string" && e.code !== "") return e.code;
  if (e && Array.isArray(e.errors) && e.errors.length > 0) return causeCode(e.errors[0]);
  if (e && typeof e.name === "string" && e.name !== "") return e.name;
  return "UNKNOWN";
}

function bare(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

// The scheme's default port comes from Node's own agents, not a literal (D-M2-T5-2).
function defaultPort(protocol: string): number {
  const agent = (protocol === "https:" ? https.globalAgent : http.globalAgent) as http.Agent & { defaultPort: number };
  return agent.defaultPort;
}

function parseUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch (err) {
    throw fail(causeCode(err));
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw fail("ERR_INVALID_PROTOCOL");
  return u;
}

function envValue(upper: string): string | undefined {
  const v = process.env[upper] ?? process.env[upper.toLowerCase()];
  return v === undefined || v.trim() === "" ? undefined : v.trim();
}

// Step 1: per-scheme proxy env, upper case first; NO_PROXY exact host or "."-suffix match.
function pickProxy(u: URL): Proxy | undefined {
  const raw = envValue(u.protocol === "https:" ? "HTTPS_PROXY" : "HTTP_PROXY");
  if (raw === undefined) return undefined;
  const host = bare(u.hostname).toLowerCase();
  for (const item of (envValue("NO_PROXY") ?? "").split(",")) {
    let entry = item.trim().toLowerCase();
    if (entry.startsWith(".")) entry = entry.slice(1);
    if (entry !== "" && (host === entry || host.endsWith("." + entry))) return undefined;
  }
  const p = parseUrl(raw.includes("://") ? raw : "http://" + raw);
  if (p.protocol !== "http:") throw fail("ERR_INVALID_PROTOCOL");
  const auth = p.username === "" ? undefined
    : "Basic " + Buffer.from(decodeURIComponent(p.username) + ":" + decodeURIComponent(p.password)).toString("base64");
  return { url: p, auth };
}

// The eight 16-bit words of an IPv6 address (a zone id after "%" is dropped; a dotted tail gives two words).
function ipv6Words(address: string): number[] {
  const zone = address.indexOf("%");
  const a = zone < 0 ? address : address.slice(0, zone);
  const words = (part: string): number[] => {
    if (part === "") return [];
    const out: number[] = [];
    for (const w of part.split(":")) {
      if (w.includes(".")) {
        const q = w.split(".").map(Number) as [number, number, number, number];
        out.push(q[0] * 256 + q[1], q[2] * 256 + q[3]);
      } else out.push(parseInt(w, 16));
    }
    return out;
  };
  const gap = a.indexOf("::");
  if (gap < 0) return words(a);
  const head = words(a.slice(0, gap));
  const tail = words(a.slice(gap + 2));
  return [...head, ...new Array<number>(8 - head.length - tail.length).fill(0), ...tail];
}

function dotted(hi: number, lo: number): string {
  return [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".");
}

// D-SSRF-RANGES-1: the IPv4 address a NAT64 (64:ff9b::/96) or 6to4 (2002::/16) address carries, else undefined.
function embeddedIpv4(address: string): string | undefined {
  const w = ipv6Words(address);
  if (w[0] === 0x64 && w[1] === 0xff9b && w[2] === 0 && w[3] === 0 && w[4] === 0 && w[5] === 0) {
    return dotted(w[6] as number, w[7] as number);
  }
  if (w[0] === 0x2002) return dotted(w[1] as number, w[2] as number);
  return undefined;
}

function checkAddress(hostname: string, address: string): void {
  const family = isIP(address);
  const inner = family === 6 ? embeddedIpv4(address) : undefined;
  if (family === 0 || BLOCKED.check(address, family === 4 ? "ipv4" : "ipv6") || (inner !== undefined && BLOCKED.check(inner, "ipv4"))) {
    throw new CtxError("SSRF", { host: hostname });
  }
}

// Step 3 for a name: every address must pass; an address in the Fake-IP pool passes only behind a Fake-IP resolver.
async function checkResolved(host: string, addrs: { address: string }[], signal: AbortSignal): Promise<void> {
  const pooled = isIP(host) === 0 ? addrs.filter((a) => inFakeIpPool(a.address)) : [];
  for (const a of addrs) if (!pooled.includes(a)) checkAddress(host, a.address);
  if (pooled.length === 0) return;
  const fakeIp = await fakeIpResolver();
  if (signal.aborted) throw fail("ABORT_ERR");
  if (!fakeIp) checkAddress(host, (pooled[0] as { address: string }).address);
}

// Steps 2-3: resolve in this process; for the URL's own host, reject if any address is private. The proxy the
// environment names is where the socket goes, not a target the model chose (#1403), so it is resolved unchecked.
async function lookupAll(host: string, signal: AbortSignal): Promise<{ address: string }[]> {
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch (err) {
    throw fail(causeCode(err));
  }
  if (signal.aborted) throw fail("ABORT_ERR");
  if (addrs.length === 0) throw fail("ENOTFOUND");
  return addrs;
}

async function resolveTarget(u: URL, signal: AbortSignal, checked: boolean): Promise<Target> {
  const host = bare(u.hostname);
  const addrs = await lookupAll(host, signal);
  if (checked) await checkResolved(host, addrs, signal);
  return { host, port: u.port === "" ? defaultPort(u.protocol) : Number(u.port), address: addrs[0].address };
}

// D-1403-PROXY-NOT-TARGET-1: through a proxy, the target is still checked on every hop. An IP literal and a name that
// resolves here are checked on every address; a name only the proxy can resolve (a proxy-only network) goes to the
// proxy, as D-M2-T5-2 had it.
async function checkProxiedTarget(u: URL, signal: AbortSignal): Promise<void> {
  const host = bare(u.hostname);
  if (isIP(host) !== 0) return checkAddress(host, host);
  let addrs: { address: string }[];
  try {
    addrs = await lookupAll(host, signal);
  } catch (err) {
    if (signal.aborted) throw err;
    return;
  }
  await checkResolved(host, addrs, signal);
}

function tlsName(host: string): string | undefined {
  return isIP(host) === 0 ? host : undefined;
}

// Step 4: one request on the checked address; through the proxy when one was picked.
function request(u: URL, conn: Target, proxy: Proxy | undefined, signal: AbortSignal): Promise<http.IncomingMessage> {
  const host = bare(u.hostname);
  const port = u.port === "" ? defaultPort(u.protocol) : Number(u.port);
  const path = u.pathname + u.search;
  return new Promise((resolve, reject) => {
    const onErr = (err: unknown) => reject(fail(causeCode(err)));
    if (proxy === undefined) {
      const mod = u.protocol === "https:" ? https : http;
      const req = mod.request({ host: conn.address, port, path, signal, servername: tlsName(host), headers: { ...baseHeaders(), host: u.host } });
      req.on("response", resolve).on("error", onErr).end();
      return;
    }
    const proxyHeaders: Record<string, string> = proxy.auth === undefined ? { ...baseHeaders() }
      : { ...baseHeaders(), "proxy-authorization": proxy.auth };
    if (u.protocol === "http:") {
      const req = http.request({ host: conn.address, port: conn.port, path: u.href, signal, headers: { host: u.host, ...proxyHeaders } });
      req.on("response", resolve).on("error", onErr).end();
      return;
    }
    const authority = (isIP(host) === 6 ? "[" + host + "]" : host) + ":" + port;
    const tunnel = http.request({ host: conn.address, port: conn.port, method: "CONNECT", path: authority, signal, headers: { host: authority, ...proxyHeaders } });
    tunnel.on("error", onErr);
    tunnel.on("connect", (res: http.IncomingMessage, socket: Socket) => {
      if (res.statusCode !== STATUS_OK_FIRST) {
        socket.destroy();
        reject(fail(res.statusCode ?? "ERR_PROXY_CONNECT"));
        return;
      }
      const req = https.request({
        host, port, path, signal, headers: { ...baseHeaders(), host: u.host },
        createConnection: () => tlsConnect({ socket, host, servername: tlsName(host) }),
      });
      req.on("response", resolve).on("error", onErr).end();
    });
    tunnel.end();
  });
}

function readBody(res: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    res.on("data", (b: Buffer) => parts.push(b));
    res.on("end", () => resolve(Buffer.concat(parts)));
    res.on("error", (err) => reject(fail(causeCode(err))));
    res.on("aborted", () => reject(fail("ECONNRESET")));
  });
}

export async function safeFetch(url: string, signal: AbortSignal): Promise<{ body: Buffer; contentType: string; finalUrl: string }> {
  let current = parseUrl(url);
  for (let hop = 0; ; hop += 1) {
    if (signal.aborted) throw fail("ABORT_ERR");
    const proxy = pickProxy(current);
    // D-1403-PROXY-NOT-TARGET-1: the target is checked on every hop; a private proxy from env (a Docker sandbox, a
    // corporate proxy) is where the socket goes and carries public targets only.
    if (proxy !== undefined) await checkProxiedTarget(current, signal);
    const conn = await resolveTarget(proxy === undefined ? current : proxy.url, signal, proxy === undefined);
    const res = await request(current, conn, proxy, signal);
    const status = res.statusCode ?? 0;
    const location = res.headers.location;
    if (STATUS_REDIRECT.has(status) && location !== undefined) {
      res.resume();
      if (hop >= FETCH_MAX_HOPS) throw fail("ERR_TOO_MANY_REDIRECTS");
      let next: URL;
      try {
        next = new URL(location, current);
      } catch (err) {
        throw fail(causeCode(err));
      }
      current = parseUrl(next.href);
      continue;
    }
    if (status < STATUS_OK_FIRST || status >= STATUS_OK_END) {
      res.resume();
      // D-1380-FETCH-UA-1: name the host that refused, so the user knows which hop failed.
      throw fail(status + " from " + bare(current.hostname));
    }
    const body = await readBody(res);
    // finalUrl labels the indexed source and is echoed in replies: never carry userinfo (a secret).
    const shown = new URL(current.href);
    shown.username = "";
    shown.password = "";
    return { body, contentType: res.headers["content-type"] ?? "", finalUrl: shown.href };
  }
}
