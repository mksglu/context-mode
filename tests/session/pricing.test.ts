import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { pricePerToken, pricingModelName, updatePricingCache } from "../../src/session/analytics.js";
import { resolveSessionStorageDir, resolveDefaultSessionDir } from "../../src/session/db.js";
import { resolveClaudeConfigDir } from "../../src/util/claude-config.js";
import { rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("Dynamic Pricing Logic", () => {
  const originalEnv = { ...process.env };
  const cachePath = join(resolveSessionStorageDir(() => resolveDefaultSessionDir({ configDir: resolveClaudeConfigDir() })).path, "pricing-cache.json");

  beforeEach(() => {
    // Reset env vars before each test
    delete process.env.PI_CONTEXT_MODE_PRICE_OUTPUT_PER_TOKEN;
    delete process.env.CONTEXT_MODE_PRICE_PER_TOKEN;
    delete process.env.CONTEXT_MODE_MODEL_NAME;
    
    // Clear cache file if it exists
    if (existsSync(cachePath)) {
      rmSync(cachePath);
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (existsSync(cachePath)) {
      rmSync(cachePath);
    }
  });

  it("defaults to Opus pricing when no env vars or cache exist", () => {
    expect(pricingModelName()).toBe("Opus");
    expect(pricePerToken()).toBe(5 / 1_000_000); // 0.000005
  });

  it("prioritizes CONTEXT_MODE_MODEL_NAME env var", () => {
    process.env.CONTEXT_MODE_MODEL_NAME = "Gemini 3.1 Pro";
    expect(pricingModelName()).toBe("Gemini 3.1 Pro");
  });

  it("prioritizes CONTEXT_MODE_PRICE_PER_TOKEN env var", () => {
    process.env.CONTEXT_MODE_PRICE_PER_TOKEN = "0.00000125";
    expect(pricePerToken()).toBe(0.00000125);
  });

  it("reads from local cache if env vars are not set", () => {
    // Mock the cache file being written by a background job
    writeFileSync(cachePath, JSON.stringify({
      modelName: "Claude Fable 5",
      pricePerToken: 0.000010
    }));

    // Should read the file and use its values
    expect(pricingModelName()).toBe("Claude Fable 5");
    expect(pricePerToken()).toBe(0.000010);
  });
  
  it("allows env vars to override the local cache", () => {
    writeFileSync(cachePath, JSON.stringify({
      modelName: "Claude Fable 5",
      pricePerToken: 0.000010
    }));

    process.env.CONTEXT_MODE_MODEL_NAME = "Gemini Override";
    process.env.CONTEXT_MODE_PRICE_PER_TOKEN = "0.00000999";

    expect(pricingModelName()).toBe("Gemini Override");
    expect(pricePerToken()).toBe(0.00000999);
  });
});
