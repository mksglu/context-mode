import { accessSync, constants, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

const BASE_ENV = "CONTEXT_MODE_DIR" as const;
const SUBDIR_SESSIONS = "sessions";
const SUBDIR_CONTENT = "content";

export type StorageDirectoryKind = "session" | "content" | "stats";
export type StorageOverrideEnvVar = typeof BASE_ENV;
export type StorageDirectorySource = "default" | "override";
export type IgnoredStorageOverrideReason = "empty";

export interface ResolvedStorageDir {
  kind: StorageDirectoryKind;
  path: string;
  envVar: StorageOverrideEnvVar | null;
  source: StorageDirectorySource;
  ignoredEnvVar?: StorageOverrideEnvVar;
  ignoredReason?: IgnoredStorageOverrideReason;
}

export class StorageDirectoryError extends Error {
  readonly kind: StorageDirectoryKind;
  readonly path: string;
  readonly overrideEnvVar: StorageOverrideEnvVar;
  readonly ignoredEnvVar?: StorageOverrideEnvVar;
  readonly ignoredReason?: IgnoredStorageOverrideReason;

  constructor(
    kind: StorageDirectoryKind,
    path: string,
    overrideEnvVar: StorageOverrideEnvVar = BASE_ENV,
    cause?: unknown,
    message?: string,
    metadata: Pick<ResolvedStorageDir, "ignoredEnvVar" | "ignoredReason"> = {},
  ) {
    super(message ?? errorMessage(kind, path, metadata), { cause });
    this.name = "StorageDirectoryError";
    this.kind = kind;
    this.path = path;
    this.overrideEnvVar = overrideEnvVar;
    this.ignoredEnvVar = metadata.ignoredEnvVar;
    this.ignoredReason = metadata.ignoredReason;
  }
}

type OverrideRoot =
  | { kind: "unset" }
  | { kind: "ignored-empty"; ignoredEnvVar: StorageOverrideEnvVar; ignoredReason: IgnoredStorageOverrideReason }
  | { kind: "override"; root: string };

const writableCache = new Map<string, string | StorageDirectoryError>();

function invalidOverride(kind: StorageDirectoryKind, path: string, detail: string): StorageDirectoryError {
  return new StorageDirectoryError(
    kind,
    path,
    BASE_ENV,
    undefined,
    [`Invalid ${BASE_ENV} for context-mode ${kind} directory: ${detail}`, storageHint()].join("\n"),
  );
}

function overrideRoot(kind: StorageDirectoryKind): OverrideRoot {
  const raw = process.env[BASE_ENV];
  if (raw === undefined) return { kind: "unset" };

  const trimmed = raw.trim();
  if (!trimmed) {
    return { kind: "ignored-empty", ignoredEnvVar: BASE_ENV, ignoredReason: "empty" };
  }
  if (!isAbsolute(trimmed)) throw invalidOverride(kind, trimmed, `${BASE_ENV} must be an absolute path.`);

  return { kind: "override", root: resolve(trimmed) };
}

function ignoredMetadata(root: OverrideRoot): Pick<ResolvedStorageDir, "ignoredEnvVar" | "ignoredReason"> {
  return root.kind === "ignored-empty"
    ? { ignoredEnvVar: root.ignoredEnvVar, ignoredReason: root.ignoredReason }
    : {};
}

function overrideDir(kind: StorageDirectoryKind, subdir: string): ResolvedStorageDir | null {
  const root = overrideRoot(kind);
  if (root.kind !== "override") return null;

  return {
    kind,
    path: join(root.root, subdir),
    envVar: BASE_ENV,
    source: "override",
  };
}

function defaultDir(
  kind: StorageDirectoryKind,
  getDefaultDir: () => string,
  metadata: Pick<ResolvedStorageDir, "ignoredEnvVar" | "ignoredReason">,
): ResolvedStorageDir {
  return {
    kind,
    path: resolve(getDefaultDir()),
    envVar: null,
    source: "default",
    ...metadata,
  };
}

export function resolveSessionStorageDir(getDefaultDir: () => string): ResolvedStorageDir {
  const root = overrideRoot("session");
  if (root.kind === "override") {
    return {
      kind: "session",
      path: join(root.root, SUBDIR_SESSIONS),
      envVar: BASE_ENV,
      source: "override",
    };
  }

  return defaultDir("session", getDefaultDir, ignoredMetadata(root));
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
    ignoredEnvVar: session.ignoredEnvVar,
    ignoredReason: session.ignoredReason,
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
    ignoredEnvVar: session.ignoredEnvVar,
    ignoredReason: session.ignoredReason,
  };
}

export function formatStorageDirectoryError(err: StorageDirectoryError): string {
  return err.message;
}

export function describeStorageDirectorySource(dir: ResolvedStorageDir): string {
  if (dir.source === "override" && dir.envVar) return `via ${dir.envVar}`;
  if (dir.ignoredEnvVar && dir.ignoredReason === "empty") return `default; ignored empty ${dir.ignoredEnvVar}`;
  return "default";
}

export function clearStorageDirectoryCheckCacheForTests(): void {
  writableCache.clear();
}

export function ensureWritableStorageDir(dir: ResolvedStorageDir): string {
  const key = [
    dir.kind,
    dir.path,
    dir.source,
    dir.envVar ?? "",
    dir.ignoredEnvVar ?? "",
    dir.ignoredReason ?? "",
  ].join("\0");
  const cached = writableCache.get(key);
  if (cached instanceof StorageDirectoryError) throw cached;
  if (cached === dir.path) return cached;

  try {
    mkdirSync(dir.path, { recursive: true });
    accessSync(dir.path, constants.W_OK);
    writableCache.set(key, dir.path);
    return dir.path;
  } catch (err) {
    const storageErr = new StorageDirectoryError(
      dir.kind,
      pathFromError(err) ?? dir.path,
      BASE_ENV,
      err,
      undefined,
      { ignoredEnvVar: dir.ignoredEnvVar, ignoredReason: dir.ignoredReason },
    );
    writableCache.set(key, storageErr);
    throw storageErr;
  }
}

function errorMessage(
  kind: StorageDirectoryKind,
  path: string,
  metadata: Pick<ResolvedStorageDir, "ignoredEnvVar" | "ignoredReason"> = {},
): string {
  return [
    `context-mode ${kind} directory is not writable: ${path}`,
    ignoredOverrideHint(metadata),
    storageHint(),
  ].filter(Boolean).join("\n");
}

function ignoredOverrideHint(metadata: Pick<ResolvedStorageDir, "ignoredEnvVar" | "ignoredReason">): string | null {
  if (metadata.ignoredEnvVar && metadata.ignoredReason === "empty") {
    return `Ignored empty ${metadata.ignoredEnvVar}; using adapter default.`;
  }
  return null;
}

function storageHint(): string {
  return `Set ${BASE_ENV} to a writable absolute path.`;
}

function pathFromError(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const path = (err as { path?: unknown }).path;
  return typeof path === "string" && path.length > 0 ? path : null;
}
