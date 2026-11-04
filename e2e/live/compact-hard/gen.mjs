// compact-hard fixture generator. Deterministic: same seed -> same bytes (mulberry32, integers only).
// Each kind writes one large data file into the temp project. A pre-compaction turn makes the model print
// it with one shell command; the runner then deletes the file, so after compaction the exact values exist
// only in the pre-compaction tool result (host side) and, with context-mode, in its store.
// Every question names one value that occurs exactly once in the file (the generator asserts this).

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const hex = (r, n) => { let s = ""; for (let i = 0; i < n; i++) s += "0123456789abcdef"[Math.floor(r() * 16)]; return s; };
const pad = (n, w) => String(n).padStart(w, "0");
function once(text, needle) {
  const i = text.indexOf(needle);
  if (i < 0 || text.indexOf(needle, i + 1) >= 0) throw new Error(`gen: "${needle}" must occur exactly once`);
}

// ---- server log: 2000 lines, printed with cat -n ----
export function serverLog(seed) {
  const r = rng(seed);
  const hosts = Array.from({ length: 40 }, () => `api-${hex(r, 4)}.int`);
  const N = 2000;
  const fatalAt = int(r, 700, 1300);
  const slowAt = int(r, 200, 1800);
  const codeLines = [int(r, 300, 600), int(r, 900, 1200), int(r, 1500, 1900)];
  const lastErrCode = `E${int(r, 2000, 2999)}`;
  const lines = [];
  const meta = { reqs: [], hosts: [] };
  for (let i = 1; i <= N; i++) {
    const req = hex(r, 12);
    const host = pick(r, hosts);
    let lat = int(r, 3, 4800);
    let level = r() < 0.06 ? "WARN" : "INFO";
    let msg = pick(r, ["GET /v1/orders", "POST /v1/charge", "GET /v1/users", "PUT /v1/cart", "GET /healthz"]) + " " + pick(r, ["200", "200", "201", "304"]);
    if (r() < 0.02) { level = "ERROR"; msg = `code=E${int(r, 1000, 1999)} upstream reset`; }
    if (codeLines.includes(i)) { level = "ERROR"; msg = "code=E4471 ledger write conflict"; }
    if (i === slowAt) lat = 9873;
    if (i === fatalAt) { level = "FATAL"; msg = "code=E9001 writer pool exhausted"; }
    meta.reqs.push(req); meta.hosts.push(host);
    lines.push(`2026-10-0${1 + (i % 9)}T${pad(i % 24, 2)}:${pad(i % 60, 2)}:${pad((i * 7) % 60, 2)}Z ${level.padEnd(5)} svc=gateway req=${req} upstream=${host} latency=${lat}ms ${msg}`);
  }
  // one extra ERROR with a code used once, near the end (held-out target)
  const lastErrAt = int(r, 1920, 1990);
  lines[lastErrAt - 1] = lines[lastErrAt - 1].split(" svc=")[0].slice(0, 20) + ` ERROR svc=gateway req=${meta.reqs[lastErrAt - 1]} upstream=${meta.hosts[lastErrAt - 1]} latency=17ms code=${lastErrCode} quota denied`;
  const text = lines.join("\n") + "\n";
  for (const k of ["FATAL", "latency=9873ms", `code=${lastErrCode}`]) once(text, k);
  return {
    file: "logs/server.log", command: "cat -n logs/server.log", text,
    values: {
      fatalReq: meta.reqs[fatalAt - 1],
      firstE4471Line: String(codeLines[0]),
      slowHost: meta.hosts[slowAt - 1],
      lastErrCode, lastErrReq: meta.reqs[lastErrAt - 1], lastErrLine: String(lastErrAt),
      fatalLine: String(fatalAt),
    },
  };
}

// ---- deploy config: nested JSON, regions x services ----
const REGIONS = ["us-east-1", "us-east-2", "us-west-1", "us-west-2", "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1", "ap-south-1", "ap-south-2"];
const SERVICES = ["ledger", "billing", "search", "auth", "notify", "export", "import", "ingest", "render", "audit", "quota", "media", "router", "cache", "mailer"];
export function deployConfig(seed) {
  const r = rng(seed);
  const zero = { region: pick(r, REGIONS), service: pick(r, SERVICES) };
  const regions = {};
  for (const reg of REGIONS) {
    const services = {};
    for (const s of SERVICES) {
      services[s] = {
        replicas: reg === zero.region && s === zero.service ? 0 : int(r, 2, 24),
        retry: { max: int(r, 2, 9), backoff_ms: int(r, 100, 99999) },
        image: { repo: `registry.int/${s}`, tag: `v${int(r, 1, 9)}.${int(r, 0, 40)}.${int(r, 0, 99)}-${hex(r, 7)}`, digest: `sha256:${hex(r, 64)}` },
        limits: { cpu_m: int(r, 100, 4000), mem_mi: int(r, 128, 16384) },
        flags: Array.from({ length: 3 }, () => `ff_${hex(r, 6)}`),
      };
    }
    regions[reg] = { zone_count: int(r, 2, 4), services };
  }
  const doc = { schema: 7, owner: "platform", rollout: { strategy: "canary", steps: [5, 25, 50, 100] }, regions };
  const text = JSON.stringify(doc, null, 2) + "\n";
  const at = (reg, s) => regions[reg].services[s];
  return {
    file: "config/deploy.json", command: "cat config/deploy.json", text,
    values: {
      ledgerApSouth2Tag: at("ap-south-2", "ledger").image.tag,
      billingEuWest3Backoff: String(at("eu-west-3", "billing").retry.backoff_ms),
      zeroReplicas: `${zero.service}@${zero.region}`,
      mailerUsWest1Digest: at("us-west-1", "mailer").image.digest,
      auditEuCentral1Mem: String(at("eu-central-1", "audit").limits.mem_mi),
      routerUsEast2RetryMax: String(at("us-east-2", "router").retry.max),
    },
  };
}

// ---- dist manifest: 900 lines "<sha256>  <bytes>  <path>" ----
export function distManifest(seed) {
  const r = rng(seed);
  const rows = [];
  const sizes = new Set();
  for (let i = 0; i < 900; i++) {
    let size;
    do size = int(r, 1000, 2000000); while (sizes.has(size));
    sizes.add(size);
    rows.push({ hash: hex(r, 64), size, path: `dist/assets/chunk-${pad(i, 4)}.${pick(r, ["js", "css", "map"])}` });
  }
  const text = rows.map((x) => `${x.hash}  ${String(x.size).padStart(8)}  ${x.path}`).join("\n") + "\n";
  const bySize = rows[int(r, 50, 850)];
  return {
    file: "dist/MANIFEST.txt", command: "cat dist/MANIFEST.txt", text,
    values: {
      hash0417: rows[417].hash, path0417: rows[417].path,
      sizeTarget: String(bySize.size), pathBySize: bySize.path,
      size0733: String(rows[733].size), path0733: rows[733].path,
      hash0088: rows[88].hash, path0088: rows[88].path,
      size0612: String(rows[612].size), path0612: rows[612].path,
    },
  };
}

// ---- test run: 1500 lines of TAP-like output, 3 failures ----
export function testRun(seed) {
  const r = rng(seed);
  const runSeed = String(int(r, 10000, 99999));
  const suites = ["queue", "journal", "fts", "sandbox", "hooks", "render", "policy"];
  const lines = [`# test run started, Randomized with seed ${runSeed}`];
  const fails = [];
  const failAt = new Set([int(r, 100, 450), int(r, 500, 950), int(r, 1000, 1400)]);
  let n = 0;
  while (lines.length < 1500) {
    n++;
    const suite = pick(r, suites);
    const name = `${suite} > ${pick(r, ["keeps", "drops", "orders", "merges", "retries", "rejects"])} ${pick(r, ["rows", "chunks", "events", "batches", "locks"])} case ${n}`;
    if (failAt.has(n)) {
      const want = int(r, 1000, 9999); let got;
      do got = int(r, 1000, 9999); while (got === want);
      const loc = `tests/${suite}/${pick(r, ["core", "edge", "io"])}-${n}.test.mjs:${int(r, 10, 480)}:${int(r, 3, 40)}`;
      fails.push({ name, want: String(want), got: String(got), loc });
      lines.push(`not ok ${n} - ${name} (${int(r, 1, 900)}ms)`, `  error: expected ${want} got ${got}`, `  at ${loc}`);
    } else {
      lines.push(`ok ${n} - ${name} (${int(r, 1, 900)}ms)`);
    }
  }
  lines.push(`# pass ${n - 3}`, "# fail 3");
  const text = lines.join("\n") + "\n";
  for (const f of fails) once(text, f.name + " (");
  return {
    file: "test-output.txt", command: "cat test-output.txt", text,
    values: { runSeed, fail0Name: fails[0].name, fail1Name: fails[1].name, fail1Got: fails[1].got, fail2Name: fails[2].name, fail2Loc: fails[2].loc, fail0Want: fails[0].want },
  };
}
