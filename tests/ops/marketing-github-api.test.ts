import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "../..");
const MARKETING_SKILL_PATH = resolve(REPO_ROOT, ".claude/skills/context-mode-ops/marketing.md");
const GRAPHQL_ISSUE_LIST_COMMAND = "gh issue list";
const REST_OPEN_ISSUES_QUERY = "search/issues?q=repo:mksglu/context-mode+is:issue+is:open";

describe("context-mode ops marketing GitHub API commands", () => {
  it("counts open issues through REST instead of GraphQL issue listing", () => {
    const marketingSkill = readFileSync(MARKETING_SKILL_PATH, "utf-8");

    expect(marketingSkill).not.toContain(GRAPHQL_ISSUE_LIST_COMMAND);
    expect(marketingSkill).toContain(REST_OPEN_ISSUES_QUERY);
  });
});
