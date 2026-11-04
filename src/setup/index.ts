// src/setup/index.ts: the setup engine (ADR-0019 section 3), shared by setup, doctor and upgrade.
export { assertWritable, buildRegistry, hookCommandString, BACKUP_DIR, LOCK_FILE, STATE_DIR, INSTRUCTION_FILES } from "./registry.ts";
export type { CheckRow, SetupContext } from "./registry.ts";
export { detectAgents, isOwnHookCommand, hookRunsCheck, hostBin, installExitOk, runDoctor, runRemove, runSetup, NOT_SET_UP_REASON, OVERHEAD_P95_MS, V1_FORM_REASON, spawnForm, spawnShim, whichBin, winCmdLine } from "./engine.ts";
export type { AgentResult, Check, SetupOptions, SetupResult } from "./engine.ts";
export { pathEntries } from "./spawn-bin.ts";
export { printPlan, printText, shellWord } from "./print.ts";
export type { PrintPlan, PrintStep } from "./print.ts";
