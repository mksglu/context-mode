import type { PreparedIndexChunkInput } from "./store.js";

export type BatchIndexStatus = "complete" | "partial" | "not_indexed";
export type BatchBudgetTrigger =
  | "per_command_bytes"
  | "batch_bytes"
  | "max_generated_chunks";
export type BatchOutputStream = "stdout" | "stderr" | "none";

export interface BatchCapturedCommand {
  label: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  skipped?: boolean;
  executorError?: boolean;
}

export interface BatchIngestionLimits {
  maxBytesPerCommand: number;
  maxTotalIndexedBytes: number;
  maxGeneratedChunks: number;
  maxChunkBytes: number;
}

export interface BatchIngestionRequest {
  maxBytesPerCommand?: number;
  maxTotalIndexedBytes?: number;
  maxGeneratedChunks?: number;
  allowLargeIngestion?: boolean;
}

export interface ResolvedBatchIngestionPolicy extends BatchIngestionLimits {
  allowLargeIngestion: boolean;
  optInApplied: boolean;
  defaults: BatchIngestionLimits;
}

export interface BatchPreparedChunk extends PreparedIndexChunkInput {
  hasCode: false;
  commandIndex: number;
  commandLabel: string;
  stream: BatchOutputStream;
  part: number;
  body: string;
  bodyBytes: number;
  partial: boolean;
}

export interface BatchCommandIngestionMetrics {
  index: number;
  label: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  status: BatchIndexStatus;
  capturedBytes: number;
  indexedBytes: number;
  droppedBytes: number;
  generatedChunks: number;
  indexedChunks: number;
  droppedChunks: number;
  partialChunks: number;
  triggeredBudgets: BatchBudgetTrigger[];
}

export interface BatchIngestionPlan {
  status: BatchIndexStatus;
  policy: ResolvedBatchIngestionPolicy;
  chunks: BatchPreparedChunk[];
  commands: BatchCommandIngestionMetrics[];
  capturedBytes: number;
  indexedBytes: number;
  droppedBytes: number;
  storedBytes: number;
  generatedChunks: number;
  indexedChunks: number;
  droppedChunks: number;
  partialChunks: number;
  maxBufferedChunkBytes: number;
  triggeredBudgets: BatchBudgetTrigger[];
}

interface CandidateChunk {
  title: string;
  header: string;
  body: string;
  bodyBytes: number;
  contentBytes: number;
  stream: BatchOutputStream;
  part: number;
}

/**
 * Defaults selected from the reproducible #961 benchmark:
 * - 8 MiB preserves representative single-command output without a large
 *   additional memory peak;
 * - 16 MiB bounds aggregate ingestion;
 * - 4,608 chunks admits an exact 16 MiB batch (4,158 measured chunks) while
 *   still truncating the 5,000-section explosion case.
 */
export const DEFAULT_BATCH_SECTION_INVENTORY_LIMIT = 50;

export const DEFAULT_BATCH_INGESTION_LIMITS: BatchIngestionLimits = {
  maxBytesPerCommand: 8 * 1024 * 1024,
  maxTotalIndexedBytes: 16 * 1024 * 1024,
  maxGeneratedChunks: 4_608,
  maxChunkBytes: 4 * 1024,
};

const MIN_CHUNK_BYTES = 256;
const LABEL_METADATA_CHARS = 160;
const COMMAND_METADATA_CHARS = 500;
const TITLE_CHARS = 160;

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
}

function validateLimits(limits: BatchIngestionLimits): void {
  assertPositiveInteger("max_bytes_per_command", limits.maxBytesPerCommand);
  assertPositiveInteger("max_total_indexed_bytes", limits.maxTotalIndexedBytes);
  assertPositiveInteger("max_generated_chunks", limits.maxGeneratedChunks);
  assertPositiveInteger("max_chunk_bytes", limits.maxChunkBytes);
  if (limits.maxChunkBytes < MIN_CHUNK_BYTES) {
    throw new Error(`max_chunk_bytes must be at least ${MIN_CHUNK_BYTES}`);
  }
}

export function resolveBatchIngestionPolicy(
  request: BatchIngestionRequest,
  defaults: BatchIngestionLimits,
): ResolvedBatchIngestionPolicy {
  validateLimits(defaults);

  const resolved: BatchIngestionLimits = {
    maxBytesPerCommand: request.maxBytesPerCommand ?? defaults.maxBytesPerCommand,
    maxTotalIndexedBytes: request.maxTotalIndexedBytes ?? defaults.maxTotalIndexedBytes,
    maxGeneratedChunks: request.maxGeneratedChunks ?? defaults.maxGeneratedChunks,
    maxChunkBytes: defaults.maxChunkBytes,
  };
  validateLimits(resolved);

  const raisedLimits: string[] = [];
  if (resolved.maxBytesPerCommand > defaults.maxBytesPerCommand) {
    raisedLimits.push("max_bytes_per_command");
  }
  if (resolved.maxTotalIndexedBytes > defaults.maxTotalIndexedBytes) {
    raisedLimits.push("max_total_indexed_bytes");
  }
  if (resolved.maxGeneratedChunks > defaults.maxGeneratedChunks) {
    raisedLimits.push("max_generated_chunks");
  }

  const allowLargeIngestion = request.allowLargeIngestion === true;
  if (raisedLimits.length > 0 && !allowLargeIngestion) {
    throw new Error(
      `Increasing ${raisedLimits.join(", ")} above defaults requires allow_large_ingestion=true`,
    );
  }

  return {
    ...resolved,
    allowLargeIngestion,
    optInApplied: allowLargeIngestion && raisedLimits.length > 0,
    defaults: { ...defaults },
  };
}

function normalizePolicy(
  policy: BatchIngestionLimits | ResolvedBatchIngestionPolicy,
): ResolvedBatchIngestionPolicy {
  validateLimits(policy);
  if ("defaults" in policy) return policy;
  return {
    ...policy,
    allowLargeIngestion: false,
    optInApplied: false,
    defaults: { ...policy },
  };
}

function truncateMetadata(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 14))}...[truncated]`;
}

function jsonMetadata(value: string, maxChars: number): string {
  return JSON.stringify(truncateMetadata(value, maxChars));
}

function buildChunkHeader(
  command: BatchCapturedCommand,
  stream: BatchOutputStream,
  part: number,
): string {
  const common = [
    `command_label=${jsonMetadata(command.label, LABEL_METADATA_CHARS)}`,
    `stream=${stream}`,
    `part=${part}`,
  ];
  if (part === 1) {
    common.splice(1, 0,
      `command=${jsonMetadata(command.command, COMMAND_METADATA_CHARS)}`,
      `exit_status=${command.exitCode}`,
      `duration_ms=${Math.max(0, Math.round(command.durationMs))}`,
      `timed_out=${command.timedOut}`,
    );
  }
  return `${common.join("\n")}\nbody=\n`;
}

function buildChunkTitle(
  command: BatchCapturedCommand,
  stream: BatchOutputStream,
  part: number,
): string {
  const label = truncateMetadata(command.label.replace(/[\r\n]+/g, " "), TITLE_CHARS);
  return `${label} [${stream} ${part}]`;
}

function utf8Slice(
  text: string,
  start: number,
  maxBytes: number,
): { text: string; end: number; bytes: number } {
  if (maxBytes <= 0 || start >= text.length) {
    return { text: "", end: start, bytes: 0 };
  }

  let candidateEnd = Math.min(text.length, start + maxBytes);
  if (
    candidateEnd < text.length
    && candidateEnd > start
    && /[\uD800-\uDBFF]/.test(text[candidateEnd - 1])
    && /[\uDC00-\uDFFF]/.test(text[candidateEnd])
  ) {
    candidateEnd -= 1;
  }

  const candidate = text.slice(start, candidateEnd);
  const candidateBytes = Buffer.byteLength(candidate, "utf8");
  if (candidateBytes <= maxBytes) {
    return { text: candidate, end: candidateEnd, bytes: candidateBytes };
  }

  let end = start;
  let bytes = 0;
  for (const char of candidate) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (bytes + charBytes > maxBytes) break;
    end += char.length;
    bytes += charBytes;
  }
  return { text: text.slice(start, end), end, bytes };
}

function takeUtf8Prefix(text: string, maxBytes: number): { text: string; bytes: number } {
  const prefix = utf8Slice(text, 0, maxBytes);
  return { text: prefix.text, bytes: prefix.bytes };
}

function* chunkStream(
  command: BatchCapturedCommand,
  stream: BatchOutputStream,
  body: string,
  maxChunkBytes: number,
  maxGeneratedChunks: number,
): Generator<CandidateChunk, number> {
  let generated = 0;
  let dropped = 0;

  if (body.length === 0) {
    const header = buildChunkHeader(command, stream, 1);
    const contentBytes = Buffer.byteLength(header, "utf8");
    if (contentBytes > maxChunkBytes) {
      throw new Error(`Batch chunk metadata exceeds max_chunk_bytes for command ${command.label}`);
    }
    if (generated < maxGeneratedChunks) {
      generated += 1;
      yield {
        title: buildChunkTitle(command, stream, 1),
        header,
        body: "",
        bodyBytes: 0,
        contentBytes,
        stream,
        part: 1,
      };
    } else {
      dropped += 1;
    }
    return dropped;
  }

  let part = 1;
  let offset = 0;
  while (offset < body.length) {
    const header = buildChunkHeader(command, stream, part);
    const headerBytes = Buffer.byteLength(header, "utf8");
    const capacity = maxChunkBytes - headerBytes;
    if (capacity <= 0) {
      throw new Error(`Batch chunk metadata leaves no body capacity for command ${command.label}`);
    }

    const slice = utf8Slice(body, offset, capacity);
    if (slice.end <= offset) {
      throw new Error(`max_chunk_bytes cannot fit one UTF-8 code point for command ${command.label}`);
    }
    if (generated < maxGeneratedChunks) {
      generated += 1;
      yield {
        title: buildChunkTitle(command, stream, part),
        header,
        body: slice.text,
        bodyBytes: slice.bytes,
        contentBytes: headerBytes + slice.bytes,
        stream,
        part,
      };
    } else {
      dropped += 1;
    }
    offset = slice.end;
    part += 1;
  }
  return dropped;
}

function addTriggers(target: Set<BatchBudgetTrigger>, source: Iterable<BatchBudgetTrigger>): void {
  for (const trigger of source) target.add(trigger);
}

function statusFor(capturedBytes: number, indexedBytes: number, indexedChunks: number): BatchIndexStatus {
  if (capturedBytes === indexedBytes && indexedChunks > 0) return "complete";
  if (indexedBytes > 0 || (capturedBytes === 0 && indexedChunks > 0)) return "partial";
  return "not_indexed";
}

function orderedStreams(command: BatchCapturedCommand): Array<[BatchOutputStream, string]> {
  const stdout: [BatchOutputStream, string] = ["stdout", command.stdout];
  const stderr: [BatchOutputStream, string] = ["stderr", command.stderr];
  const hasOutput = command.stdout.length > 0 || command.stderr.length > 0;
  if (!hasOutput) return [["none", ""]];

  const stderrFirst = command.exitCode !== 0 || command.timedOut || command.executorError === true;
  return (stderrFirst ? [stderr, stdout] : [stdout, stderr]).filter(([, body]) => body.length > 0);
}

export function planBatchIngestion(
  commands: readonly BatchCapturedCommand[],
  limits: BatchIngestionLimits | ResolvedBatchIngestionPolicy,
): BatchIngestionPlan {
  const policy = normalizePolicy(limits);
  const chunks: BatchPreparedChunk[] = [];
  const commandMetrics: BatchCommandIngestionMetrics[] = [];
  const batchTriggers = new Set<BatchBudgetTrigger>();

  let capturedBytes = 0;
  let indexedBytes = 0;
  let storedBytes = 0;
  let generatedChunks = 0;
  let indexedChunks = 0;
  let droppedChunks = 0;
  let partialChunks = 0;
  let maxBufferedChunkBytes = 0;
  let batchRemaining = policy.maxTotalIndexedBytes;

  for (let commandIndex = 0; commandIndex < commands.length; commandIndex++) {
    const command = commands[commandIndex];
    const commandCapturedBytes =
      Buffer.byteLength(command.stdout, "utf8") + Buffer.byteLength(command.stderr, "utf8");
    capturedBytes += commandCapturedBytes;

    let commandRemaining = policy.maxBytesPerCommand;
    let commandIndexedBytes = 0;
    let commandGeneratedChunks = 0;
    let commandIndexedChunks = 0;
    let commandDroppedChunks = 0;
    let commandPartialChunks = 0;
    const commandTriggers = new Set<BatchBudgetTrigger>();

    for (const [stream, body] of orderedStreams(command)) {
      const generationCapacity = Math.max(0, policy.maxGeneratedChunks - generatedChunks);
      const iterator = chunkStream(
        command,
        stream,
        body,
        policy.maxChunkBytes,
        generationCapacity,
      );
      let result = iterator.next();
      while (!result.done) {
        const candidate = result.value;
        generatedChunks += 1;
        commandGeneratedChunks += 1;
        maxBufferedChunkBytes = Math.max(maxBufferedChunkBytes, candidate.contentBytes);

        const commandRemainingBefore = commandRemaining;
        const batchRemainingBefore = batchRemaining;
        const byteAllowance = Math.min(commandRemainingBefore, batchRemainingBefore);
        const admitted = takeUtf8Prefix(candidate.body, byteAllowance);
        const bodyWasPartial = admitted.bytes < candidate.bodyBytes;
        const shouldStoreMetadataOnly = candidate.part === 1;
        const shouldStore = admitted.bytes > 0 || shouldStoreMetadataOnly;

        if (!shouldStore) {
          droppedChunks += 1;
          commandDroppedChunks += 1;
        } else {
          const content = candidate.header + admitted.text;
          const contentBytes = Buffer.byteLength(content, "utf8");
          if (contentBytes > policy.maxChunkBytes) {
            throw new Error(`Prepared batch chunk exceeds max_chunk_bytes for command ${command.label}`);
          }
          chunks.push({
            title: candidate.title,
            content,
            hasCode: false,
            commandIndex,
            commandLabel: command.label,
            stream: candidate.stream,
            part: candidate.part,
            body: admitted.text,
            bodyBytes: admitted.bytes,
            partial: bodyWasPartial,
          });
          indexedChunks += 1;
          commandIndexedChunks += 1;
          storedBytes += contentBytes;
          if (bodyWasPartial) {
            partialChunks += 1;
            commandPartialChunks += 1;
          }
        }

        commandRemaining -= admitted.bytes;
        batchRemaining -= admitted.bytes;
        commandIndexedBytes += admitted.bytes;
        indexedBytes += admitted.bytes;

        if (bodyWasPartial) {
          if (
            commandRemainingBefore <= batchRemainingBefore
            && commandRemainingBefore < candidate.bodyBytes
          ) {
            commandTriggers.add("per_command_bytes");
            batchTriggers.add("per_command_bytes");
          }
          if (
            batchRemainingBefore <= commandRemainingBefore
            && batchRemainingBefore < candidate.bodyBytes
          ) {
            commandTriggers.add("batch_bytes");
            batchTriggers.add("batch_bytes");
          }
        }
        result = iterator.next();
      }

      const generationDropped = result.value;
      if (generationDropped > 0) {
        droppedChunks += generationDropped;
        commandDroppedChunks += generationDropped;
        commandTriggers.add("max_generated_chunks");
        batchTriggers.add("max_generated_chunks");
      }
    }
    const commandDroppedBytes = commandCapturedBytes - commandIndexedBytes;
    const commandStatus = statusFor(
      commandCapturedBytes,
      commandIndexedBytes,
      commandIndexedChunks,
    );
    commandMetrics.push({
      index: commandIndex,
      label: command.label,
      exitCode: command.exitCode,
      durationMs: command.durationMs,
      timedOut: command.timedOut,
      status: commandStatus,
      capturedBytes: commandCapturedBytes,
      indexedBytes: commandIndexedBytes,
      droppedBytes: commandDroppedBytes,
      generatedChunks: commandGeneratedChunks,
      indexedChunks: commandIndexedChunks,
      droppedChunks: commandDroppedChunks,
      partialChunks: commandPartialChunks,
      triggeredBudgets: [...commandTriggers],
    });
    addTriggers(batchTriggers, commandTriggers);
  }

  const droppedBytes = capturedBytes - indexedBytes;
  const status: BatchIndexStatus = commandMetrics.every(
    (command) => command.status === "complete",
  )
    ? "complete"
    : indexedChunks > 0
      ? "partial"
      : "not_indexed";
  return {
    status,
    policy,
    chunks,
    commands: commandMetrics,
    capturedBytes,
    indexedBytes,
    droppedBytes,
    storedBytes,
    generatedChunks,
    indexedChunks,
    droppedChunks,
    partialChunks,
    maxBufferedChunkBytes,
    triggeredBudgets: [...batchTriggers],
  };
}

function displayStatus(status: BatchIndexStatus): string {
  if (status === "partial") return "partially indexed";
  if (status === "not_indexed") return "not indexed";
  return "complete";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function formatCount(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatBatchSectionInventory(
  chunks: readonly BatchPreparedChunk[],
  totalChunks: number,
  limit: number = DEFAULT_BATCH_SECTION_INVENTORY_LIMIT,
): string[] {
  assertPositiveInteger("batch_inventory_display_limit", limit);
  if (!Number.isSafeInteger(totalChunks) || totalChunks < 0) {
    throw new Error("total_chunks must be a non-negative safe integer");
  }

  const displayed = Math.min(limit, totalChunks, chunks.length);
  const lines = ["## Indexed Sections", ""];
  for (let index = 0; index < displayed; index++) {
    const chunk = chunks[index];
    const bytes = Buffer.byteLength(chunk.content, "utf8");
    lines.push(`- ${chunk.title} (${(bytes / 1024).toFixed(1)}KB)`);
  }

  lines.push("");
  if (displayed < totalChunks) {
    lines.push(
      `Showing ${formatCount(displayed)} of ${formatCount(totalChunks)} sections; ` +
      `${formatCount(totalChunks - displayed)} omitted.`,
    );
  } else {
    lines.push(`Showing all ${formatCount(totalChunks)} sections.`);
  }
  return lines;
}

export function formatBatchIngestionSummary(plan: BatchIngestionPlan): string[] {
  const triggered = plan.triggeredBudgets.length > 0
    ? plan.triggeredBudgets.join(", ")
    : "none";
  const lines = [
    "## Indexing Budget",
    "",
    `- Indexing status: ${displayStatus(plan.status)}`,
    `- Captured body bytes: ${plan.capturedBytes} (${formatBytes(plan.capturedBytes)})`,
    `- Indexed body bytes: ${plan.indexedBytes} (${formatBytes(plan.indexedBytes)})`,
    `- Dropped body bytes: ${plan.droppedBytes} (${formatBytes(plan.droppedBytes)})`,
    `- Stored bytes including metadata: ${plan.storedBytes} (${formatBytes(plan.storedBytes)})`,
    `- Chunks: generated=${plan.generatedChunks}, indexed=${plan.indexedChunks}, dropped=${plan.droppedChunks}, partial=${plan.partialChunks}`,
    `- Triggered budgets: ${triggered}`,
    `- Limits: per-command=${plan.policy.maxBytesPerCommand}, batch=${plan.policy.maxTotalIndexedBytes}, chunks=${plan.policy.maxGeneratedChunks}`,
    `- Explicit large-ingestion opt-in: requested=${plan.policy.allowLargeIngestion}, applied=${plan.policy.optInApplied}`,
    "",
    "## Command Indexing",
    "",
  ];

  for (const command of plan.commands) {
    const commandTriggered = command.triggeredBudgets.length > 0
      ? command.triggeredBudgets.join(",")
      : "none";
    lines.push(
      `- ${command.label}: ${displayStatus(command.status)}; exit=${command.exitCode}; duration=${Math.max(0, Math.round(command.durationMs))}ms; indexed=${command.indexedBytes}B; dropped=${command.droppedBytes}B; chunks=generated:${command.generatedChunks},indexed:${command.indexedChunks},dropped:${command.droppedChunks}; budgets=${commandTriggered}`,
    );
  }

  return lines;
}

export function batchIngestionStructuredContent(
  plan: BatchIngestionPlan,
): { indexing: Record<string, unknown> } {
  return {
    indexing: {
      status: plan.status,
      captured_bytes: plan.capturedBytes,
      indexed_bytes: plan.indexedBytes,
      dropped_bytes: plan.droppedBytes,
      stored_bytes: plan.storedBytes,
      generated_chunks: plan.generatedChunks,
      indexed_chunks: plan.indexedChunks,
      dropped_chunks: plan.droppedChunks,
      partial_chunks: plan.partialChunks,
      triggered_budgets: [...plan.triggeredBudgets],
      limits: {
        max_bytes_per_command: plan.policy.maxBytesPerCommand,
        max_total_indexed_bytes: plan.policy.maxTotalIndexedBytes,
        max_generated_chunks: plan.policy.maxGeneratedChunks,
        max_chunk_bytes: plan.policy.maxChunkBytes,
      },
      allow_large_ingestion: plan.policy.allowLargeIngestion,
      opt_in_applied: plan.policy.optInApplied,
      commands: plan.commands.map((command) => ({
        index: command.index,
        label: command.label,
        exit_status: command.exitCode,
        duration_ms: command.durationMs,
        timed_out: command.timedOut,
        status: command.status,
        captured_bytes: command.capturedBytes,
        indexed_bytes: command.indexedBytes,
        dropped_bytes: command.droppedBytes,
        generated_chunks: command.generatedChunks,
        indexed_chunks: command.indexedChunks,
        dropped_chunks: command.droppedChunks,
        partial_chunks: command.partialChunks,
        triggered_budgets: [...command.triggeredBudgets],
      })),
    },
  };
}