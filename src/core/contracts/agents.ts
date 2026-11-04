// impl/01 §1, impl/00 §3.1, docs/architecture/PRD.md §3 (10-agent table, top to bottom). Data only.
export const AGENT_IDS = ["claude-code","codex","gemini","qwen","copilot-cli","vscode","kiro","zcode","pi","opencode"] as const; // TECH-SPEC §2
export type AgentId = typeof AGENT_IDS[number];
