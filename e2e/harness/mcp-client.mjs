// e2e/harness/mcp-client.mjs
// Spawns an MCP server bundle and speaks newline-delimited JSON-RPC over
// its stdio. Spec: docs/v2/impl/14-tests.md §2, 00-architecture.md e2e table.
//
// The 2000 ms close() timeout below is a harness-local literal, not a
// src/core/contracts/constants.ts value: e2e/ never imports src/ (GS4),
// so this file cannot import the real constant. See
// docs/v2/impl/DEVIATIONS.md D-M0-4.
import { spawn } from "node:child_process";

const CLOSE_TIMEOUT_MS = 2000;

/**
 * @param {string} bundlePath
 * @param {Record<string,string>} [env]
 * @param {string[]} [args] - argv after the bundle path, e.g. ["--agent", "vscode"] (DEVIATIONS D-M1-F1-1)
 * @param {{cwd?: string}} [opts] - spawn cwd: a plugin host starts the server in its plugin dir (D-C166-NATIVE-CWD-1)
 * @returns {{request:Function, notify:Function, close:Function, kill:Function}}
 */
// D-CR2-SID-2: the server reads the host session id from CLAUDE_CODE_SESSION_ID (D-CR2-SID-1). A case
// run from inside a Claude Code session inherits that session's id; it is not the id of the host the case
// models, so it is dropped. A case that sets its own value keeps it.
const HOST_SESSION_VARS = ["CLAUDE_CODE_SESSION_ID"];
function childEnv(env) {
  const out = { ...(env ?? process.env) };
  for (const k of HOST_SESSION_VARS) if (out[k] !== undefined && out[k] === process.env[k]) delete out[k];
  return out;
}

export function spawnBundle(bundlePath, env, args = [], opts = {}) {
  const child = spawn(process.execPath, [bundlePath, ...args], {
    stdio: ["pipe", "pipe", "pipe"],
    env: childEnv(env),
    ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
  });

  let buf = "";
  let nextId = 1;
  const pending = new Map();
  let exited = false;
  let exitPromise;

  exitPromise = new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      exited = true;
      resolve({ code, signal });
      for (const { reject } of pending.values()) {
        reject(new Error(`mcp-client: bundle exited (code ${code}, signal ${signal}) before replying`));
      }
      pending.clear();
    });
  });

  child.once("error", (err) => {
    for (const { reject } of pending.values()) {
      reject(new Error(`mcp-client: bundle failed to start: ${err.message}`));
    }
    pending.clear();
  });

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (!line.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg && msg.id !== undefined && pending.has(msg.id)) {
        const { resolve } = pending.get(msg.id);
        pending.delete(msg.id);
        resolve(msg.result ?? msg);
      } else if (msg && msg.id !== undefined) {
        throw new Error(`mcp-client: unmatched reply id ${msg.id}`);
      }
    }
  });

  function write(obj) {
    child.stdin.write(JSON.stringify(obj) + "\n");
  }

  function request(method, params) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      write({ jsonrpc: "2.0", id, method, params: params ?? {} });
    });
  }

  function notify(method, params) {
    write({ jsonrpc: "2.0", method, params: params ?? {} });
  }

  async function close() {
    try {
      child.stdin.end();
    } catch {
      // stdin may already be closed
    }
    if (exited) return;
    const timed = await Promise.race([
      exitPromise.then(() => "exited"),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), CLOSE_TIMEOUT_MS)),
    ]);
    if (timed === "exited") return;
    child.kill("SIGKILL");
    throw new Error(`mcp-client: bundle did not exit in ${CLOSE_TIMEOUT_MS}ms`);
  }

  // Test teardown (t.after): a case whose assert throws before close() must not leave the bundle
  // running, or its stdio pipes keep the node:test file process alive forever (D-M1-F1-1).
  function kill() {
    if (!exited) child.kill("SIGKILL");
  }

  return { request, notify, close, kill };
}
