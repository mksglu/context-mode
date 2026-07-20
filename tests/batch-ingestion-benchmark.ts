import { performance } from "node:perf_hooks";
import { ContentStore } from "../src/store.js";
import {
  DEFAULT_BATCH_SECTION_INVENTORY_LIMIT,
  formatBatchSectionInventory,
  planBatchIngestion,
  resolveBatchIngestionPolicy,
  type BatchCapturedCommand,
  type BatchIngestionLimits,
} from "../src/batch-ingestion.js";

const KiB = 1024;
const MiB = 1024 * KiB;
const DEFAULT_REPEATS = 3;

interface Scenario {
  name: string;
  description: string;
  commands: BatchCapturedCommand[];
}

interface Sample {
  scenario: string;
  mode: string;
  wallMs: number;
  capturedBytes: number;
  indexedBytes: number;
  droppedBytes: number;
  storedBytes: number;
  generatedChunks: number;
  indexedChunks: number;
  droppedChunks: number;
  peakHeapDeltaBytes: number;
  peakRssDeltaBytes: number;
  largestIntermediateBytes: number;
  duplicateIntermediateBytes: number;
  inventoryRows: number;
  inventoryBytes: number;
}

function parseRepeats(): number {
  const index = process.argv.indexOf("--repeats");
  if (index < 0) return DEFAULT_REPEATS;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("--repeats must be a positive integer");
  }
  return value;
}

function asciiBody(bytes: number): string {
  if (bytes <= 0) return "";
  const line = `${"x".repeat(1023)}\n`;
  const fullLines = Math.floor(bytes / line.length);
  const remainder = bytes - fullLines * line.length;
  return line.repeat(fullLines) + "x".repeat(remainder);
}

function command(label: string, bytes: number): BatchCapturedCommand {
  return {
    label,
    command: `synthetic --bytes ${bytes}`,
    stdout: asciiBody(bytes),
    stderr: "",
    exitCode: 0,
    durationMs: 1,
    timedOut: false,
  };
}

function scenarios(): Scenario[] {
  return [
    {
      name: "small-batch",
      description: "two ordinary 64 KiB command outputs",
      commands: [command("small-a", 64 * KiB), command("small-b", 64 * KiB)],
    },
    {
      name: "single-near-8mib",
      description: "one command at 8 MiB minus one byte",
      commands: [command("near", 8 * MiB - 1)],
    },
    {
      name: "single-over-8mib",
      description: "one command at 9 MiB",
      commands: [command("over", 9 * MiB)],
    },
    {
      name: "batch-at-16mib",
      description: "two commands exactly filling the 16 MiB batch candidate",
      commands: [command("batch-exact-a", 8 * MiB), command("batch-exact-b", 8 * MiB)],
    },
    {
      name: "batch-over-16mib",
      description: "three individually valid 6 MiB commands totaling 18 MiB",
      commands: [command("batch-a", 6 * MiB), command("batch-b", 6 * MiB), command("batch-c", 6 * MiB)],
    },
    {
      name: "chunk-explosion",
      description: "5,000 tiny command outputs that each create a distinct labeled section",
      commands: Array.from({ length: 5_000 }, (_, index) => command(`tiny-${index}`, 1)),
    },
  ];
}

const DEFAULT_LIMITS_4096: BatchIngestionLimits = {
  maxBytesPerCommand: 8 * MiB,
  maxTotalIndexedBytes: 16 * MiB,
  maxGeneratedChunks: 4_096,
  maxChunkBytes: 4 * KiB,
};

const DEFAULT_LIMITS_4608: BatchIngestionLimits = {
  ...DEFAULT_LIMITS_4096,
  maxGeneratedChunks: 4_608,
};

const DEFAULT_LIMITS_8192: BatchIngestionLimits = {
  ...DEFAULT_LIMITS_4096,
  maxGeneratedChunks: 8_192,
};

function memorySnapshot(): NodeJS.MemoryUsage {
  return process.memoryUsage();
}

function maybeGc(): void {
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc;
  if (gc) gc();
}

function deltaPeak(before: number, ...values: number[]): number {
  return Math.max(0, ...values.map((value) => value - before));
}

function combinedOutput(command: BatchCapturedCommand): string {
  if (!command.stderr) return command.stdout;
  if (!command.stdout) return command.stderr;
  return `${command.stdout}${command.stdout.endsWith("\n") ? "" : "\n"}${command.stderr}`;
}

function runLegacy(scenario: Scenario): Sample {
  maybeGc();
  const before = memorySnapshot();
  const start = performance.now();
  const fragments = scenario.commands.map((item) =>
    `# ${item.label}\n\n$ ${item.command}\n\n${combinedOutput(item)}\n`,
  );
  const afterFragments = memorySnapshot();
  const displayMarkdown = fragments.join("\n");
  const afterJoin = memorySnapshot();
  const displayFragmentBytes = fragments.reduce(
    (sum, fragment) => sum + Buffer.byteLength(fragment, "utf8"),
    0,
  );
  const joinedBytes = Buffer.byteLength(displayMarkdown, "utf8");
  const store = new ContentStore(":memory:");
  const indexed = store.index({
    content: displayMarkdown,
    source: `bench:legacy:${scenario.name}`,
  });
  const rows = store.getChunksBySource(indexed.sourceId);
  const storedBytes = rows.reduce(
    (sum, row) => sum + Buffer.byteLength(row.content, "utf8"),
    0,
  );
  const afterIndex = memorySnapshot();
  const inventory = [
    "## Indexed Sections",
    "",
    ...rows.map((row) => {
      const bytes = Buffer.byteLength(row.content, "utf8");
      return `- ${row.title} (${(bytes / 1024).toFixed(1)}KB)`;
    }),
  ].join("\n");
  const afterInventory = memorySnapshot();
  const wallMs = performance.now() - start;
  store.close();

  return {
    scenario: scenario.name,
    mode: "legacy-display-markdown",
    wallMs,
    capturedBytes: scenario.commands.reduce(
      (sum, item) => sum + Buffer.byteLength(item.stdout) + Buffer.byteLength(item.stderr),
      0,
    ),
    indexedBytes: joinedBytes,
    droppedBytes: 0,
    storedBytes,
    generatedChunks: indexed.totalChunks,
    indexedChunks: indexed.totalChunks,
    droppedChunks: 0,
    peakHeapDeltaBytes: deltaPeak(
      before.heapUsed,
      afterFragments.heapUsed,
      afterJoin.heapUsed,
      afterIndex.heapUsed,
      afterInventory.heapUsed,
    ),
    peakRssDeltaBytes: deltaPeak(
      before.rss,
      afterFragments.rss,
      afterJoin.rss,
      afterIndex.rss,
      afterInventory.rss,
    ),
    largestIntermediateBytes: joinedBytes,
    duplicateIntermediateBytes: displayFragmentBytes + joinedBytes,
    inventoryRows: rows.length,
    inventoryBytes: Buffer.byteLength(inventory, "utf8"),
  };
}

function runBudgeted(
  scenario: Scenario,
  limits: BatchIngestionLimits,
  mode: string,
): Sample {
  maybeGc();
  const before = memorySnapshot();
  const start = performance.now();
  const policy = resolveBatchIngestionPolicy({}, limits);
  const plan = planBatchIngestion(scenario.commands, policy);
  const afterPlan = memorySnapshot();
  const store = new ContentStore(":memory:");
  const indexed = store.indexPreparedChunks(
    plan.chunks,
    `bench:${mode}:${scenario.name}`,
  );
  const afterIndex = memorySnapshot();
  const inventory = formatBatchSectionInventory(plan.chunks, indexed.totalChunks).join("\n");
  const afterInventory = memorySnapshot();
  const wallMs = performance.now() - start;
  store.close();

  return {
    scenario: scenario.name,
    mode,
    wallMs,
    capturedBytes: plan.capturedBytes,
    indexedBytes: plan.indexedBytes,
    droppedBytes: plan.droppedBytes,
    storedBytes: plan.storedBytes,
    generatedChunks: plan.generatedChunks,
    indexedChunks: indexed.totalChunks,
    droppedChunks: plan.droppedChunks,
    peakHeapDeltaBytes: deltaPeak(
      before.heapUsed,
      afterPlan.heapUsed,
      afterIndex.heapUsed,
      afterInventory.heapUsed,
    ),
    peakRssDeltaBytes: deltaPeak(
      before.rss,
      afterPlan.rss,
      afterIndex.rss,
      afterInventory.rss,
    ),
    largestIntermediateBytes: plan.maxBufferedChunkBytes,
    duplicateIntermediateBytes: 0,
    inventoryRows: Math.min(DEFAULT_BATCH_SECTION_INVENTORY_LIMIT, indexed.totalChunks),
    inventoryBytes: Buffer.byteLength(inventory, "utf8"),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarize(samples: Sample[]): Record<string, unknown>[] {
  const groups = new Map<string, Sample[]>();
  for (const sample of samples) {
    const key = `${sample.scenario}\u0000${sample.mode}`;
    const group = groups.get(key) ?? [];
    group.push(sample);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => {
    const first = group[0];
    return {
      scenario: first.scenario,
      mode: first.mode,
      repeats: group.length,
      median_wall_ms: Number(median(group.map((item) => item.wallMs)).toFixed(3)),
      min_wall_ms: Number(Math.min(...group.map((item) => item.wallMs)).toFixed(3)),
      max_wall_ms: Number(Math.max(...group.map((item) => item.wallMs)).toFixed(3)),
      median_peak_heap_delta_bytes: Math.round(median(group.map((item) => item.peakHeapDeltaBytes))),
      median_peak_rss_delta_bytes: Math.round(median(group.map((item) => item.peakRssDeltaBytes))),
      captured_bytes: first.capturedBytes,
      indexed_bytes: first.indexedBytes,
      dropped_bytes: first.droppedBytes,
      stored_bytes: first.storedBytes,
      generated_chunks: first.generatedChunks,
      indexed_chunks: first.indexedChunks,
      dropped_chunks: first.droppedChunks,
      largest_intermediate_bytes: first.largestIntermediateBytes,
      duplicate_intermediate_bytes: first.duplicateIntermediateBytes,
      inventory_rows: first.inventoryRows,
      inventory_bytes: first.inventoryBytes,
    };
  });
}

const repeats = parseRepeats();
const allScenarios = scenarios();
const samples: Sample[] = [];

for (let repeat = 0; repeat < repeats; repeat++) {
  for (const scenario of allScenarios) {
    samples.push(runLegacy(scenario));
    samples.push(runBudgeted(scenario, DEFAULT_LIMITS_4096, "budgeted-8mib-16mib-4096chunks"));
    samples.push(runBudgeted(scenario, DEFAULT_LIMITS_4608, "budgeted-8mib-16mib-4608chunks"));
    samples.push(runBudgeted(scenario, DEFAULT_LIMITS_8192, "budgeted-8mib-16mib-8192chunks"));
  }
}

console.log(JSON.stringify({
  metadata: {
    benchmark: "Context Mode #961 indexed byte/chunk budgets",
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    repeats,
    gc_exposed: typeof (globalThis as typeof globalThis & { gc?: () => void }).gc === "function",
    measurement: {
      wall_clock: "planner/legacy assembly plus in-memory FTS5 indexing and source inventory",
      memory: "max process.memoryUsage sample after assembly/planning and after indexing, relative to pre-run GC sample",
      largest_intermediate: "legacy joined display Markdown bytes versus budgeted planner maximum single prepared chunk bytes",
      duplicate_intermediate: "legacy formatted-fragment bytes plus joined Markdown bytes; budgeted path performs no batch-body join",
      inventory: "legacy production path hydrates and lists every section; budgeted production formatter lists at most 50 prepared chunk metadata rows",
    },
  },
  policies: {
    candidate_4096_chunks: DEFAULT_LIMITS_4096,
    candidate_4608_chunks: DEFAULT_LIMITS_4608,
    candidate_8192_chunks: DEFAULT_LIMITS_8192,
  },
  scenarios: allScenarios.map(({ name, description, commands }) => ({
    name,
    description,
    command_count: commands.length,
    captured_bytes: commands.reduce(
      (sum, item) => sum + Buffer.byteLength(item.stdout) + Buffer.byteLength(item.stderr),
      0,
    ),
  })),
  summary: summarize(samples),
  raw_samples: samples,
}, null, 2));