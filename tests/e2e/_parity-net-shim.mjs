// Test-only network seam for fetch-index-search-parity.test.mjs (no product code is changed).
// safeFetch blocks every loopback address (SSRF), so a local fixture server is unreachable by design. This preload
// keeps the whole safeFetch path (URL parse, DNS check, per-address SSRF check) and moves only the last hop:
//   dns lookup of PARITY_HOST  -> 203.0.113.7 (TEST-NET-3, a public-looking address, passes the SSRF check)
//   http.request to 203.0.113.7 -> connects to 127.0.0.1 (the fixture server)
// Loaded with NODE_OPTIONS=--import=<this file> in a spawned MCP server, or imported before the in-process plugin.
import dns from "node:dns";
import http from "node:http";
import { syncBuiltinESMExports } from "node:module";

export const FAKE_ADDRESS = "203.0.113.7";
const host = process.env.PARITY_HOST ?? "docs.parity.test";

const lookup = dns.promises.lookup;
dns.promises.lookup = async (name, opts) => {
  if (name === host) return opts?.all ? [{ address: FAKE_ADDRESS, family: 4 }] : { address: FAKE_ADDRESS, family: 4 };
  return lookup.call(dns.promises, name, opts);
};
const request = http.request;
http.request = (opts, ...rest) => {
  if (opts && typeof opts === "object" && opts.host === FAKE_ADDRESS) opts = { ...opts, host: "127.0.0.1" };
  return request.call(http, opts, ...rest);
};
syncBuiltinESMExports();
