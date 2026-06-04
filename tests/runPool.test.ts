import { describe, test, expect } from "vitest";
import { runPool, type PoolJob } from "../src/runPool.js";

// Helper: create a job that resolves to a value after a delay
function delayedJob<T>(value: T, delayMs = 0): PoolJob<T> {
  return {
    run: () => new Promise((resolve) => setTimeout(() => resolve(value), delayMs)),
  };
}

// Helper: create a job that rejects with an error
function failingJob<T>(error: Error): PoolJob<T> {
  return {
    run: () => Promise.reject(error),
  };
}

describe("runPool", () => {
  describe("empty input", () => {
    test("returns empty settled array for no jobs", async () => {
      const result = await runPool([], { concurrency: 4 });
      expect(result.settled).toEqual([]);
      expect(result.effectiveConcurrency).toBe(0);
      expect(result.capped).toBe(false);
    });
  });

  describe("basic execution", () => {
    test("executes all jobs and returns results in input order", async () => {
      const jobs: PoolJob<number>[] = [
        delayedJob(1, 10),
        delayedJob(2, 5),
        delayedJob(3, 15),
      ];
      const result = await runPool(jobs, { concurrency: 2 });

      expect(result.settled).toHaveLength(3);
      expect(result.settled[0]).toEqual({ status: "fulfilled", value: 1 });
      expect(result.settled[1]).toEqual({ status: "fulfilled", value: 2 });
      expect(result.settled[2]).toEqual({ status: "fulfilled", value: 3 });
    });

    test("handles single job", async () => {
      const jobs: PoolJob<string>[] = [delayedJob("hello")];
      const result = await runPool(jobs, { concurrency: 4 });

      expect(result.settled).toHaveLength(1);
      expect(result.settled[0]).toEqual({ status: "fulfilled", value: "hello" });
      expect(result.effectiveConcurrency).toBe(1);
    });
  });

  describe("concurrency capping", () => {
    test("clamps concurrency to job count when jobs < requested", async () => {
      const jobs: PoolJob<number>[] = [delayedJob(1), delayedJob(2)];
      const result = await runPool(jobs, { concurrency: 10 });

      expect(result.effectiveConcurrency).toBe(2);
      expect(result.capped).toBe(true);
    });

    test("uses requested concurrency when jobs >= requested", async () => {
      const jobs: PoolJob<number>[] = Array.from({ length: 10 }, (_, i) =>
        delayedJob(i)
      );
      const result = await runPool(jobs, { concurrency: 3 });

      expect(result.effectiveConcurrency).toBe(3);
      expect(result.capped).toBe(false);
    });

    test("clamps concurrency to 1 when requested is 0 or negative", async () => {
      const jobs: PoolJob<number>[] = [delayedJob(1), delayedJob(2)];
      const result = await runPool(jobs, { concurrency: 0 });

      expect(result.effectiveConcurrency).toBe(1);
    });

    test("capByCpuCount limits concurrency", async () => {
      const jobs: PoolJob<number>[] = Array.from({ length: 100 }, (_, i) =>
        delayedJob(i)
      );
      const result = await runPool(jobs, {
        concurrency: 1000,
        capByCpuCount: true,
      });

      // Should be capped by CPU count (at least 1)
      expect(result.effectiveConcurrency).toBeLessThanOrEqual(128);
      expect(result.effectiveConcurrency).toBeGreaterThanOrEqual(1);
      expect(result.capped).toBe(true);
    });
  });

  describe("error handling (allSettled semantics)", () => {
    test("captures rejected jobs without affecting siblings", async () => {
      const error = new Error("job failed");
      const jobs: PoolJob<number>[] = [
        delayedJob(1),
        failingJob(error),
        delayedJob(3),
      ];
      const result = await runPool(jobs, { concurrency: 3 });

      expect(result.settled[0]).toEqual({ status: "fulfilled", value: 1 });
      expect(result.settled[1]).toEqual({ status: "rejected", reason: error });
      expect(result.settled[2]).toEqual({ status: "fulfilled", value: 3 });
    });

    test("handles all jobs failing", async () => {
      const jobs: PoolJob<number>[] = [
        failingJob(new Error("fail 1")),
        failingJob(new Error("fail 2")),
        failingJob(new Error("fail 3")),
      ];
      const result = await runPool(jobs, { concurrency: 2 });

      expect(result.settled).toHaveLength(3);
      for (const s of result.settled) {
        expect(s.status).toBe("rejected");
      }
    });
  });

  describe("onSettled callback", () => {
    test("calls onSettled for each job with correct index", async () => {
      const settledIndices: number[] = [];
      const jobs: PoolJob<number>[] = [
        delayedJob(1, 10),
        delayedJob(2, 5),
        delayedJob(3, 15),
      ];

      await runPool(jobs, {
        concurrency: 2,
        onSettled: (idx) => settledIndices.push(idx),
      });

      // All indices should be reported
      expect(settledIndices.sort()).toEqual([0, 1, 2]);
    });

    test("onSettled receives fulfilled results", async () => {
      const results: Array<{ idx: number; status: string }> = [];
      const jobs: PoolJob<string>[] = [delayedJob("a"), delayedJob("b")];

      await runPool(jobs, {
        concurrency: 2,
        onSettled: (idx, result) => {
          results.push({ idx, status: result.status });
        },
      });

      expect(results).toContainEqual({ idx: 0, status: "fulfilled" });
      expect(results).toContainEqual({ idx: 1, status: "fulfilled" });
    });

    test("onSettled receives rejected results", async () => {
      const results: Array<{ idx: number; status: string }> = [];
      const jobs: PoolJob<number>[] = [delayedJob(1), failingJob(new Error("fail"))];

      await runPool(jobs, {
        concurrency: 2,
        onSettled: (idx, result) => {
          results.push({ idx, status: result.status });
        },
      });

      expect(results).toContainEqual({ idx: 0, status: "fulfilled" });
      expect(results).toContainEqual({ idx: 1, status: "rejected" });
    });
  });

  describe("output ordering", () => {
    test("preserves input order regardless of completion order", async () => {
      // Job 0 is slowest, job 2 is fastest
      const jobs: PoolJob<number>[] = [
        delayedJob(0, 30),
        delayedJob(1, 20),
        delayedJob(2, 10),
      ];
      const result = await runPool(jobs, { concurrency: 3 });

      // Results should be in input order, not completion order
      expect(result.settled[0]).toEqual({ status: "fulfilled", value: 0 });
      expect(result.settled[1]).toEqual({ status: "fulfilled", value: 1 });
      expect(result.settled[2]).toEqual({ status: "fulfilled", value: 2 });
    });
  });
});
