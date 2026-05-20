import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  formatStorageDirectoryError,
  resolveContentStorageDir,
  resolveSessionStorageDir,
  resolveStatsStorageDir,
  StorageDirectoryError,
} from "../src/storage-paths.js";

const ENV_KEY = "CONTEXT_MODE_DIR";
const savedValue = process.env[ENV_KEY];

function resetEnv(): void {
  if (savedValue === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = savedValue;
}

describe("storage path overrides", () => {
  afterEach(() => {
    resetEnv();
  });

  it("uses adapter defaults when no storage override is set", () => {
    delete process.env[ENV_KEY];

    const session = resolveSessionStorageDir(() => "/home/me/.codex/context-mode/sessions");
    const content = resolveContentStorageDir(() => "/home/me/.codex/context-mode/sessions");
    const stats = resolveStatsStorageDir(() => "/home/me/.codex/context-mode/sessions");

    expect(session).toEqual({
      kind: "session",
      path: "/home/me/.codex/context-mode/sessions",
      envVar: null,
      source: "default",
    });
    expect(content).toEqual({
      kind: "content",
      path: "/home/me/.codex/context-mode/content",
      envVar: null,
      source: "default",
    });
    expect(stats).toEqual({
      kind: "stats",
      path: "/home/me/.codex/context-mode/sessions",
      envVar: null,
      source: "default",
    });
  });

  it("uses CONTEXT_MODE_DIR as the single root for sessions, content, and stats", () => {
    process.env[ENV_KEY] = "/tmp/context-mode";

    expect(resolveSessionStorageDir(() => "/ignored")).toEqual({
      kind: "session",
      path: resolve("/tmp/context-mode/sessions"),
      envVar: ENV_KEY,
      source: "override",
    });
    expect(resolveContentStorageDir(() => "/ignored")).toEqual({
      kind: "content",
      path: resolve("/tmp/context-mode/content"),
      envVar: ENV_KEY,
      source: "override",
    });
    expect(resolveStatsStorageDir(() => "/ignored")).toEqual({
      kind: "stats",
      path: resolve("/tmp/context-mode/sessions"),
      envVar: ENV_KEY,
      source: "override",
    });
  });

  it("rejects a blank CONTEXT_MODE_DIR", () => {
    process.env[ENV_KEY] = "   ";

    expect(() => resolveSessionStorageDir(() => "/ignored")).toThrow(StorageDirectoryError);
    expect(() => resolveSessionStorageDir(() => "/ignored")).toThrow(
      "CONTEXT_MODE_DIR must not be empty.",
    );
  });

  it("rejects a relative CONTEXT_MODE_DIR", () => {
    process.env[ENV_KEY] = "tmp/context-mode";

    expect(() => resolveSessionStorageDir(() => "/ignored")).toThrow(StorageDirectoryError);
    expect(() => resolveSessionStorageDir(() => "/ignored")).toThrow(
      "CONTEXT_MODE_DIR must be an absolute path.",
    );
  });

  it("formats storage permission errors with the root override hint", () => {
    const err = new StorageDirectoryError(
      "content",
      "/Users/me/.codex/context-mode/content",
      ENV_KEY,
      Object.assign(new Error("EPERM"), { code: "EPERM" }),
    );

    expect(formatStorageDirectoryError(err)).toContain(
      "context-mode content directory is not writable: /Users/me/.codex/context-mode/content",
    );
    expect(formatStorageDirectoryError(err)).toContain(
      "Set CONTEXT_MODE_DIR to a writable path.",
    );
  });
});
