// impl/09 §5.2 hook entry I/O, DEVIATIONS D-M7-HP-1 (GS6). Re-exported by dispatch.ts so the entry keeps
// its import rule (contracts + dispatch only, D-M3-H2-9).
// D-CI-PERF-3: node:fs through getBuiltinModule; a static ESM import of node:fs also loads fs/promises, readline and streams.
const { read, writeSync } = process.getBuiltinModule("node:fs") as typeof import("node:fs");

// D-CI-PERF-6: stdin is read with async fs.read on fd 0 (libuv thread pool), not the process.stdin stream: the
// stream builds net, stream and pipe_wrap (28 internal modules, about 3.5 ms per call on Node 24 and 26). It is not
// a sync read, so the event loop never blocks in read(0) (the D-M7-HP-1 hang was a sync readFileSync(0)). Any error
// other than EOF (EAGAIN on a non-blocking pipe, EISDIR, ...) falls back to the stream and keeps the bytes read so far.
const CHUNK = 65536;

function readFd0(parts: Buffer[]): Promise<boolean> {
  const buf = Buffer.allocUnsafe(CHUNK);
  return new Promise((resolve) => {
    const step = (): void => {
      read(0, buf, 0, CHUNK, null, (err, n) => {
        if (err) return resolve((err as NodeJS.ErrnoException).code === "EOF"); // Windows pipe end = EOF error
        if (n === 0) return resolve(true);
        parts.push(Buffer.from(buf.subarray(0, n)));
        step();
      });
    };
    step();
  });
}

export async function readStdin(): Promise<string> {
  const parts: Buffer[] = [];
  if (!(await readFd0(parts))) for await (const c of process.stdin) parts.push(c as Buffer);
  return Buffer.concat(parts).toString("utf8");
}

// GS6 (D-M7-HP-1): stdout is written with writeSync to fd 1, so the hook never builds the
// process.stdout stream. Loop until every byte is out; EAGAIN (non-blocking pipe)
// falls back to process.stdout, which queues the rest and flushes before the process ends.
export function writeOut(text: string): void {
  const buf = Buffer.from(text, "utf8");
  let off = 0;
  try {
    while (off < buf.length) off += writeSync(1, buf, off, buf.length - off);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EAGAIN") throw err;
    process.stdout.write(buf.subarray(off));
  }
}
