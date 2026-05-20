import { accessSync, constants, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

const BASE_ENV = "CONTEXT_MODE_DIR" as const;
const SUBDIR_SESSIONS = "sessions";
const SUBDIR_CONTENT = "content";

export type StorageDirectoryKind = "session" | "content" | "stats";
export type StorageOverrideEnvVar = typeof BASE_ENV;

export interface ResolvedStorageDir {
  kind: StorageDirectoryKind;
  path: string;
  envVar: StorageOverrideEnvVar | null;
  source: "default" | "override";
}

export class StorageDirectoryError extends Error {
  readonly kind: StorageDirectoryKind;
  readonly path: string;
  readonly overrideEnvVar: StorageOverrideEnvVar;

  constructor(
    kind: StorageDirectoryKind,
    path: string,
    overrideEnvVar: StorageOverrideEnvVar = BASE_ENV,
    cause?: unknown,
    message = errorMessage(kind, path),
  ) {
    super(message, { cause });
    this.name = "StorageDirectoryError";
    this.kind = kind;
    this.path = path;
    this.overrideEnvVar = overrideEnvVar;
  }
}

function invalidOverride(kind: StorageDirectoryKind, path: string, detail: string): StorageDirectoryError {
  return new StorageDirectoryError(
    kind,
    path,
    BASE_ENV,
    undefined,
    [`Invalid ${BASE_ENV} for context-mode ${kind} directory: ${detail}`, storageHint()].join("\n"),
  );
}

function overrideRoot(kind: StorageDirectoryKind): string | null {
  const raw = process.env[BASE_ENV];
  if (raw === undefined) return null;

  const trimmed = raw.trim();
  if (!trimmed) throw invalidOverride(kind, "<empty>", `${BASE_ENV} must not be empty.`);
  if (!isAbsolute(trimmed)) throw invalidOverride(kind, trimmed, `${BASE_ENV} must be an absolute path.`);

  return resolve(trimmed);
}

function overrideDir(kind: StorageDirectoryKind, subdir: string): ResolvedStorageDir | null {
  const root = overrideRoot(kind);
  if (!root) return null;

  return {
    kind,
    path: join(root, subdir),
    envVar: BASE_ENV,
    source: "override",
  };
}

function defaultDir(kind: StorageDirectoryKind, getDefaultDir: () => string): ResolvedStorageDir {
  return {
    kind,
    path: getDefaultDir(),
    envVar: null,
    source: "default",
  };
}

export function resolveSessionStorageDir(getDefaultDir: () => string): ResolvedStorageDir {
  return overrideDir("session", SUBDIR_SESSIONS) ?? defaultDir("session", getDefaultDir);
}

export function resolveContentStorageDir(getSessionDir: () => string): ResolvedStorageDir {
  const override = overrideDir("content", SUBDIR_CONTENT);
  if (override) return override;

  const session = resolveSessionStorageDir(getSessionDir);
  return {
    kind: "content",
    path: join(dirname(session.path), SUBDIR_CONTENT),
    envVar: session.envVar,
    source: session.source,
  };
}

export function resolveStatsStorageDir(getDefaultSessionDir: () => string): ResolvedStorageDir {
  const override = overrideDir("stats", SUBDIR_SESSIONS);
  if (override) return override;

  const session = resolveSessionStorageDir(getDefaultSessionDir);
  return {
    kind: "stats",
    path: session.path,
    envVar: session.envVar,
    source: session.source,
  };
}

export function ensureWritableStorageDir(dir: ResolvedStorageDir): string {
  try {
    mkdirSync(dir.path, { recursive: true });
    accessSync(dir.path, constants.W_OK);
    return dir.path;
  } catch (err) {
    throw new StorageDirectoryError(dir.kind, pathFromError(err) ?? dir.path, BASE_ENV, err);
  }
}

export function formatStorageDirectoryError(err: StorageDirectoryError): string {
  return err.message;
}

function errorMessage(kind: StorageDirectoryKind, path: string): string {
  return [`context-mode ${kind} directory is not writable: ${path}`, storageHint()].join("\n");
}

function storageHint(): string {
  return `Set ${BASE_ENV} to a writable path.`;
}

function pathFromError(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const path = (err as { path?: unknown }).path;
  return typeof path === "string" && path.length > 0 ? path : null;
}
