export interface BitbusRecordInput {
  type?: string;
  actor?: string;
  file?: string;
  pattern?: string;
  reason?: string;
  data?: Record<string, unknown>;
}

export interface BitbusRecord {
  type: string;
  actor: string;
  file: string;
  pattern: string;
  reason: string;
  data: Record<string, unknown>;
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function cleanType(value: unknown): string {
  const raw = clean(value) || "event";
  return raw.toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "") || "event";
}

export function normalizeBitbusRecord(input: BitbusRecordInput): BitbusRecord {
  return {
    type: cleanType(input.type ?? "pattern_failed"),
    actor: clean(input.actor),
    file: clean(input.file),
    pattern: clean(input.pattern),
    reason: clean(input.reason),
    data: input.data ?? {},
  };
}

export function formatBitbusRecord(record: BitbusRecord): string {
  const lines = [
    `# bitbus:${record.type}`,
    record.actor ? `actor: ${record.actor}` : "",
    record.file ? `file: ${record.file}` : "",
    record.pattern ? `pattern: ${record.pattern}` : "",
    record.reason ? `reason: ${record.reason}` : "",
  ].filter(Boolean);

  const dataEntries = Object.entries(record.data)
    .filter(([, value]) => value !== undefined && value !== "")
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [key, value] of dataEntries) {
    lines.push(`${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
  }

  return `${lines.join("\n")}\n`;
}
