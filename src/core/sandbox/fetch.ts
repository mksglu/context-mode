// impl/03 §6, impl/05 §4, TECH-SPEC GP5 (proxy env, SSRF per hop), DECISIONS-r3 Q19, DECISIONS-r4 A8/A52/B57,
// DEVIATIONS D-M2-T5-2. One path: resolve the connect target, check every address, connect to the
// checked address (no second DNS lookup), follow redirects as new hops.
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import type { Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { FETCH_MAX_HOPS } from "../contracts/constants.ts";
import { CtxError } from "../contracts/errors.ts";

// impl/03 §6 step 3 / "Constants used": fixed protocol data, not tunable, written inline.
const PRIVATE_RANGES: ReadonlyArray<readonly [string, number, "ipv4" | "ipv6"]> = [
  ["127.0.0.0", 8, "ipv4"],
  ["10.0.0.0", 8, "ipv4"],
  ["172.16.0.0", 12, "ipv4"],
  ["192.168.0.0", 16, "ipv4"],
  ["169.254.0.0", 16, "ipv4"],
  ["0.0.0.0", 32, "ipv4"],
  ["::1", 128, "ipv6"],
  ["::", 128, "ipv6"],
  ["fc00::", 7, "ipv6"],
  ["fe80::", 10, "ipv6"],
];
const BLOCKED = new BlockList();
for (const [net, prefix, type] of PRIVATE_RANGES) BLOCKED.addSubnet(net, prefix, type);

// RFC 9110 status classes (fixed protocol data, D-M2-T5-2).
const STATUS_OK_FIRST = 200;
const STATUS_OK_END = 300;
const STATUS_REDIRECT: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

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

function checkAddress(hostname: string, address: string): void {
  const family = isIP(address);
  if (family === 0 || BLOCKED.check(address, family === 4 ? "ipv4" : "ipv6")) {
    throw new CtxError("SSRF", { host: hostname });
  }
}

// Steps 2-3: resolve in this process, reject if any address is private; return the checked address.
async function resolveTarget(u: URL, signal: AbortSignal): Promise<Target> {
  const host = bare(u.hostname);
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch (err) {
    throw fail(causeCode(err));
  }
  if (signal.aborted) throw fail("ABORT_ERR");
  if (addrs.length === 0) throw fail("ENOTFOUND");
  for (const a of addrs) checkAddress(host, a.address);
  return { host, port: u.port === "" ? defaultPort(u.protocol) : Number(u.port), address: addrs[0].address };
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
      const req = mod.request({ host: conn.address, port, path, signal, servername: tlsName(host), headers: { host: u.host } });
      req.on("response", resolve).on("error", onErr).end();
      return;
    }
    const proxyHeaders: Record<string, string> = proxy.auth === undefined ? {} : { "proxy-authorization": proxy.auth };
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
        host, port, path, signal, headers: { host: u.host },
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
    // D-M2-T5-2: through a proxy the proxy resolves the origin name; an IP-literal origin is still checked here.
    const origin = bare(current.hostname);
    if (proxy !== undefined && isIP(origin) !== 0) checkAddress(origin, origin);
    const conn = await resolveTarget(proxy === undefined ? current : proxy.url, signal);
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
      throw fail(status);
    }
    const body = await readBody(res);
    // finalUrl labels the indexed source and is echoed in replies: never carry userinfo (a secret).
    const shown = new URL(current.href);
    shown.username = "";
    shown.password = "";
    return { body, contentType: res.headers["content-type"] ?? "", finalUrl: shown.href };
  }
}
