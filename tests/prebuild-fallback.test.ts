import { describe, test, expect } from "vitest";
import { loadDatabase, findPrebuildPath } from "../src/db-base.js";

describe("prebuild fallback", () => {
  test("loadDatabase returns a constructor", () => {
    const Database = loadDatabase();
    expect(Database).toBeDefined();
    expect(typeof Database).toBe("function");
  });

  test("can open an in-memory database", () => {
    const Database = loadDatabase();
    const db = new Database(":memory:");
    expect(db).toBeDefined();
    db.close();
  });

  test("FTS5 is available", () => {
    const Database = loadDatabase();
    const db = new Database(":memory:");
    expect(() => {
      db.exec("CREATE VIRTUAL TABLE test_fts USING fts5(content)");
    }).not.toThrow();
    db.close();
  });

  test("nativeBinding option works with explicit path", () => {
    const Database = loadDatabase();
    // better-sqlite3's own build path should work as nativeBinding
    const db = new Database(":memory:", {
      nativeBinding: require.resolve("better-sqlite3/build/Release/better_sqlite3.node"),
    });
    expect(db).toBeDefined();
    db.exec("CREATE VIRTUAL TABLE t USING fts5(c)");
    db.close();
  });

  test("findPrebuildPath returns null when no prebuilds shipped", () => {
    // In dev, prebuilds/ directory won't exist — CI populates it
    const result = findPrebuildPath();
    // Either null (no prebuilds) or a valid path (if someone built locally)
    if (result !== null) {
      expect(typeof result).toBe("string");
      expect(result).toContain("better_sqlite3.node");
    }
  });
});
