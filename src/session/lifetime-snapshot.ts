import {
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const SNAPSHOT_SCHEMA_VERSION = 1;
const SNAPSHOT_FILE_NAME = "lifetime-stats.json";

export interface LifetimeTokenSnapshot {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  tokens: number;
  computedAt: number;
}

function isLifetimeTokenSnapshot(value: unknown): value is LifetimeTokenSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<LifetimeTokenSnapshot>;
  return snapshot.schemaVersion === SNAPSHOT_SCHEMA_VERSION
    && typeof snapshot.tokens === "number"
    && Number.isFinite(snapshot.tokens)
    && snapshot.tokens >= 0
    && typeof snapshot.computedAt === "number"
    && Number.isFinite(snapshot.computedAt)
    && snapshot.computedAt > 0;
}

/**
 * Read the shared result of the last explicitly requested lifetime aggregation.
 * This path is deliberately independent of SessionDB discovery so periodic MCP
 * bridge heartbeats stay O(1), regardless of the number of project databases.
 */
export function readLifetimeTokenSnapshot(
  statsDir: string,
): LifetimeTokenSnapshot | undefined {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(join(statsDir, SNAPSHOT_FILE_NAME), "utf8"),
    );
    return isLifetimeTokenSnapshot(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Publish a lifetime aggregation for all bridge processes sharing statsDir. */
export function writeLifetimeTokenSnapshot(
  statsDir: string,
  tokens: number,
  computedAt = Date.now(),
): LifetimeTokenSnapshot {
  const snapshot: LifetimeTokenSnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    tokens: Math.max(0, Math.round(tokens)),
    computedAt,
  };
  const filePath = join(statsDir, SNAPSHOT_FILE_NAME);
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;

  try {
    writeFileSync(tempPath, JSON.stringify(snapshot));
    renameSync(tempPath, filePath);
  } finally {
    rmSync(tempPath, { force: true });
  }

  return snapshot;
}
