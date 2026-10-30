// impl/11 §5, impl/00 §5.1. MCP server entry; build/build.mjs bundles it as server.mjs with the prompt
// inlined (src/prompt/_generated.ts, impl/13 §2.2 step 3). M1 wires the store (DEVIATIONS D-M1-10,
// D-M1-11, D-M1-T10-1); adapters (M3) and the tool modules (M2-M5) come with their own milestones.
import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer, type ServerContext, type StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import { serveStdio, type StdioServerHandle } from "@modelcontextprotocol/server/stdio";
import { AGENT_IDS, type AgentId } from "../core/contracts/agents.ts";
import {
  HOST_SESSION_ENV, INTERNAL_ERROR_LINE, NODE_MIN, OWNER_STOP_EXT, OWNERS_DIR_NAME, PROJECTS_DIR_NAME, RUN_SESSION_PREFIX, SERVER_KEY, TOOLS_TTL_MS,
  UPGRADE_STOP_DELAY_MS,
} from "../core/contracts/constants.ts";
import { CtxError } from "../core/contracts/errors.ts";
import type { DbHandle, ProjectContext, ToolContext, ToolReply } from "../core/contracts/types.ts";
import { appendEvent, ownCallRow } from "../core/journal/append.ts";
import { installExitGuard } from "../core/lifecycle/exit.ts";
import { resolveConfigDir } from "../core/project/config-dir.ts";
import { resolveProject } from "../core/project/resolve.ts";
import { cleanupProject, sweepDeadProjects } from "../core/store/cleanup.ts";
import { closeDb, openDb } from "../core/store/db.ts";
import { removeOwnerPid, writeOwnerPid } from "../core/store/owners.ts";
import { z } from "zod/v4";
import { TOOLS, checkCall, type RegisteredTool } from "../core/tools/registry.ts";
import { INSTRUCTIONS } from "../prompt/_generated.ts";
import { isEntry } from "./is-entry.ts";

export { INSTRUCTIONS };

// §5 step 1a-1d. Re-run per call (Assumption A3); no clientInfo read.
function resolveAgent(argv: readonly string[], env: NodeJS.ProcessEnv): AgentId | undefined {
  let afterFlag = false;
  for (const arg of argv) {
    if (afterFlag) {
      const known = AGENT_IDS.find((a) => a === arg);
      if (known === undefined) console.error("context-mode: unknown --agent " + arg);
      return known;
    }
    afterFlag = arg === "--agent";
  }
  if (env.CLAUDE_PROJECT_DIR !== undefined) return "claude-code";
  return undefined; // §5 step 1c-1d: a spawn-cwd agent also passes --agent at install; else unresolved
}

// §5 step 2a: compare dotted versions as numbers, not strings (numeric collation, no parsing).
const NUMERIC = new Intl.Collator("en", { numeric: true });
function versionAtLeast(have: string, min: string): boolean {
  const [lower] = [have, min].sort(NUMERIC.compare);
  return lower === min;
}

// D-CALL-SHAPE-1: the host gets the real JSON Schema (required, enums, descriptions kept); the SDK's own
// validation accepts every input, so a bad call reaches dispatch, which answers with one line that shows the exact call.
function passThrough(tool: RegisteredTool<unknown>): StandardSchemaWithJSON {
  const json = (): Record<string, unknown> => z.toJSONSchema(tool.schema, { target: "draft-2020-12", io: "input" }) as Record<string, unknown>;
  return {
    "~standard": {
      version: 1,
      vendor: "context-mode",
      validate: (value: unknown) => ({ value }),
      jsonSchema: { input: json, output: json },
    },
  } as unknown as StandardSchemaWithJSON;
}

// §5 step 2.
async function isDegraded(): Promise<boolean> {
  if (!versionAtLeast(process.versions.node, NODE_MIN)) return true;
  try {
    await import("node:sqlite");
    return false;
  } catch {
    return true;
  }
}

function metaString(meta: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = meta?.[key];
  return typeof v === "string" && v !== "" ? v : undefined;
}

function metaNumber(meta: Record<string, unknown> | undefined, key: string): number | undefined {
  const v = meta?.[key];
  return typeof v === "number" && Number.isSafeInteger(v) ? v : undefined;
}

// D-CR2-SID-1: _meta.sessionId, else the session id the host put in the server env (the id its hooks
// journal under, so scope:"session" finds hook-indexed rows), else the process-local mcp:<serverId>.
export function sessionIdOf(meta: Record<string, unknown> | undefined, agent: AgentId | undefined, env: NodeJS.ProcessEnv, serverId: string): string {
  const fromMeta = metaString(meta, "sessionId");
  if (fromMeta !== undefined) return fromMeta;
  const key = agent === undefined ? undefined : HOST_SESSION_ENV[agent];
  const fromHost = key === undefined ? undefined : env[key];
  if (typeof fromHost === "string" && fromHost !== "") return fromHost;
  return RUN_SESSION_PREFIX + serverId;
}

// §5 step 7d: one line to the client, the stack to stderr only.
function errorReply(err: unknown): ToolReply {
  if (err instanceof CtxError) return { text: err.toLine(), isError: true, sandboxBytes: 0 };
  console.error(err);
  return { text: INTERNAL_ERROR_LINE, isError: true, sandboxBytes: 0 };
}

export async function startServer(argv: string[], env: NodeJS.ProcessEnv): Promise<void> {
  const serverId = randomUUID(); // 00 Assumption A8: process-local, generated once
  const degraded = await isDegraded();
  // §5 step 3: degraded mode serves ctx_doctor only (PRD §13).
  const tools = degraded ? TOOLS.filter((t) => t.name === "ctx_doctor") : TOOLS;

  // The server's own DB handles, one per project it has written to, opened on the first call for
  // that project (§5 step 6, 00 §5.1 step 5) and closed at shutdown (§5 step 9a). These hold
  // resources, not identity: the ProjectContext itself is resolved again on every call (§5 step 5b).
  const pending = new Map<string, Promise<DbHandle>>(); // dbPath -> open in progress or done
  const held: DbHandle[] = [];
  let cleaned = false; // D-M1-11: cleanup runs once per process, never on a timer

  // §5 step 6b, D-M1-11, D-M1-T7-1: openDb, then cleanupProject (before our own owner file, else
  // its live-owner check always sees us), then writeOwnerPid, then sweepDeadProjects.
  async function openOwn(project: ProjectContext): Promise<DbHandle> {
    const db = await openDb(project);
    // D-M1-T3-5: the config dir comes from the process env, the same one resolveProject used.
    const configDir = resolveConfigDir(process.env);
    try {
      if (!cleaned) cleanupProject(db, configDir);
      writeOwnerPid(configDir, project.projectKey, serverId);
    } catch (err) {
      closeDb(db);
      throw err;
    }
    held.push(db);
    if (!cleaned) {
      cleaned = true;
      sweepDeadProjects(configDir);
    }
    return db;
  }

  // ADR-0002 decision 3: a held handle whose path has vanished is a hard error, never a recreate.
  async function ownDb(project: ProjectContext): Promise<DbHandle> {
    let opening = pending.get(project.dbPath);
    if (opening === undefined) {
      opening = openOwn(project);
      pending.set(project.dbPath, opening);
      // A failed open leaves no entry, so the next call opens again (one attempt per call, no loop).
      opening.catch(() => pending.delete(project.dbPath));
    }
    const db = await opening;
    if (!existsSync(db.path)) throw new CtxError("DB_GONE");
    return db;
  }

  // impl/07 uninstall step 1 (D-M5-U7-3): <DATA_ROOT>/projects/<projectKey>/owners/<serverId>.stop.
  function stopMarker(configDir: string, projectKey: string): string {
    return join(configDir, PROJECTS_DIR_NAME, projectKey, OWNERS_DIR_NAME, serverId + OWNER_STOP_EXT);
  }
  // Only a project this server owns can carry its marker (uninstall marks live owners only).
  function stopRequested(): boolean {
    const configDir = resolveConfigDir(process.env);
    return held.some((db) => existsSync(stopMarker(configDir, db.projectKey)));
  }

  // impl/00 §5.2 step 5, ADR-0009 §0: one journal row per own call (D-M1-10).
  async function journal(project: ProjectContext, ctx: ToolContext, name: string, reply: ToolReply): Promise<void> {
    const db = await ownDb(project);
    appendEvent(db, ownCallRow(project, ctx, name, reply));
  }

  // §5 steps 5-7: stateless dispatch; ToolContext is built fresh from each request.
  function dispatch(server: McpServer, tool: RegisteredTool<unknown>) {
    return async (input: unknown, req: ServerContext) => {
      const meta = req.mcpReq._meta as Record<string, unknown> | undefined;
      const agent = resolveAgent(argv, env);
      // §5 step 6a, 7a: resolved lazily, at most once per call, never cached across calls.
      let project: ProjectContext | undefined;
      const projectOf = (): ProjectContext => {
        if (agent === undefined) throw new CtxError("NO_PROJECT", { kind: "--agent" });
        project ??= resolveProject(agent, { env, argv, cwd: process.cwd(), piCwd: undefined });
        return project;
      };
      const ctx: ToolContext = {
        get project(): ProjectContext {
          return projectOf();
        },
        sessionId: sessionIdOf(meta, agent, env, serverId),
        turn: metaNumber(meta, "turn") ?? 0,
        signal: req.mcpReq.signal,
        clientInfo: server.server.getClientVersion(),
        protocolVersion: server.server.getNegotiatedProtocolVersion() ?? "",
      };
      // D-CALL-SHAPE-1: the SDK passes the input through (see passThrough); the check and its one-line error live here.
      let reply: ToolReply;
      const checked = checkCall(tool, input);
      if (!checked.ok) {
        reply = { text: checked.line, isError: true, sandboxBytes: 0 };
      } else {
        try {
          reply = await tool.handler(checked.data, ctx);
        } catch (err) {
          reply = errorReply(err);
        }
      }
      // impl/07 uninstall step 1, D-M5-R1-1: a call that left this server's own stop marker (ctx_upgrade
      // mode "uninstall") writes no journal row (the project data is going away) and ends the process
      // UPGRADE_STOP_DELAY_MS after the reply is written.
      if (stopRequested()) {
        setTimeout(stopSelf, UPGRADE_STOP_DELAY_MS);
        return { content: [{ type: "text" as const, text: reply.text }], isError: reply.isError };
      }
      // D-M1-T10-1: degraded mode has no node:sqlite, and an unresolved project has no DB, so
      // neither writes a row (a handler that needs the project already surfaced NO_PROJECT).
      // A failure on a resolved project (DB_GONE, DB_CORRUPT, busy) becomes the call's result.
      if (!degraded) {
        let resolved: ProjectContext | undefined;
        try {
          resolved = projectOf();
        } catch (err) {
          console.error("context-mode: no journal row: " + (err instanceof Error ? err.message : String(err)));
        }
        if (resolved !== undefined) {
          try {
            await journal(resolved, ctx, tool.name, reply);
          } catch (err) {
            reply = errorReply(err);
          }
        }
      }
      return { content: [{ type: "text" as const, text: reply.text }], isError: reply.isError };
    };
  }

  // §5 step 4. One factory serves both eras through the SDK's own negotiation: initialize (2025-xx)
  // and server/discover (2026-07-28) answer from the same INSTRUCTIONS bytes (ADR-0007 d3, GS9).
  function createServer(): McpServer {
    const server = new McpServer(
      { name: SERVER_KEY, version: "dev" }, // DEVIATIONS: no version constant in contracts yet
      {
        instructions: INSTRUCTIONS,
        cacheHints: {
          "tools/list": { ttlMs: TOOLS_TTL_MS, cacheScope: "public" },
          "server/discover": { ttlMs: TOOLS_TTL_MS, cacheScope: "public" },
        },
      },
    );
    for (const tool of tools) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          // zod 3.25 `zod/v4` has no ~standard.jsonSchema type; the SDK converts it with z.toJSONSchema (DEVIATIONS).
          inputSchema: passThrough(tool),
          ...(tool.readOnly ? { annotations: { readOnlyHint: true } } : {}),
          ...(tool.alwaysLoad ? { _meta: { "anthropic/alwaysLoad": true } } : {}),
        },
        dispatch(server, tool),
      );
    }
    return server;
  }

  // §5 step 9, then step 10 (stdio last). No other timer (§5 step 9c).
  let handle: StdioServerHandle | undefined;
  // §5 step 9a, impl/02 §7.2: removeOwnerPid, then closeDb, each best-effort (never blocks shutdown).
  // D-M5-R1-1: the server also removes its own stop marker, so owners/ holds no file of a dead server.
  function shutdown(): void {
    for (const db of held) {
      try {
        const configDir = resolveConfigDir(process.env);
        removeOwnerPid(configDir, db.projectKey, serverId);
        rmSync(stopMarker(configDir, db.projectKey), { force: true });
      } catch (err) {
        console.error(err);
      }
      closeDb(db); // never throws (impl/02 §6.3)
    }
    handle?.close().catch((err: unknown) => console.error(err));
  }
  // D-M5-R1-1: the uninstall stop takes the same path as stdin EOF (impl/11 §4 steps 2-3).
  function stopSelf(): void {
    shutdown();
    process.kill(process.pid, "SIGTERM");
  }
  installExitGuard({ onShutdown: shutdown, isTTY: process.stdin.isTTY === true });
  handle = serveStdio(createServer);

  // §5 step 11: the promise is the server's lifetime.
  await new Promise<void>((resolve) => process.once("exit", () => resolve()));
}

// The bundle (server.mjs) is the process entry, so import.meta.main is true there; a unit test that
// imports this module for INSTRUCTIONS does not start the server (DEVIATIONS D-M2-R1-1).
if (isEntry(import.meta.main, process.argv[1], fileURLToPath(import.meta.url))) {
  const [, , ...cliArgs] = process.argv; // node <server.mjs> <args...>
  await startServer(cliArgs, process.env);
}
