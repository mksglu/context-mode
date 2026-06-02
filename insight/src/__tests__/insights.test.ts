import { describe, it, expect } from 'vitest';
import { generateInsights, generateCategoryInsights } from '../lib/insights';
import type { AnalyticsData, CategoryAnalyticsData } from '../lib/api';

function makeAnalyticsData(overrides: Partial<AnalyticsData> = {}): AnalyticsData {
  return {
    totals: {
      totalSessions: 0, totalEvents: 0, avgSessionMin: 0,
      totalErrors: 0, errorRate: 0, totalCompacts: 0,
      compactRate: 0, reads: 0, writes: 0,
      readWriteRatio: 0, totalFileOps: 0,
      totalSubagents: 0, totalTasks: 0,
      totalPrompts: 0, promptsPerSession: 0,
      uniqueProjects: 0,
      totalCommits: 0, commitsPerSession: 0, sandboxRate: 0,
      totalRules: 0, totalEditTestCycles: 0,
    },
    sessionsByDate: [],
    sessionDurations: [],
    toolUsage: [],
    mcpTools: [],
    errors: [],
    fileActivity: [],
    workModes: [],
    timeToFirstCommit: [],
    exploreExecRatio: { explore: 0, execute: 0, total: 0 },
    reworkData: [],
    gitActivity: [],
    subagents: { total: 0, bursts: 0, maxConcurrent: 0, parallelCount: 0, sequentialCount: 0, timeSavedMin: 0, burstDetails: [] },
    projectActivity: [],
    hourlyPattern: [],
    weeklyTrend: [],
    tasks: [],
    prompts: [],
    masteryTrend: [],
    commitRate: [],
    sandboxAdoption: { sandbox_calls: 0, total_calls: 0 },
    rulesFreshness: [],
    editTestCycles: [],
    ...overrides,
  };
}

function makeCategoryData(overrides: Partial<CategoryAnalyticsData> = {}): CategoryAnalyticsData {
  return {
    categories: [],
    errorIntelligence: {
      totalErrors: 0, resolvedErrors: 0, resolutionRate: 0,
      retryStorms: 0, avgLatencyMs: 0, p95LatencyMs: 0, p95SampleCount: 0,
      slowestTool: null, topErrorTools: [], latencyByTool: [],
    },
    delegation: { launched: 0, completed: 0, completionRate: 0, parallelBursts: 0, maxConcurrent: 0, timeSavedMin: 0 },
    governance: { totalRejections: 0, totalDecisions: 0, totalConstraints: 0, planApproved: 0, planRejected: 0, planApprovalRate: 0, topRejected: [] },
    gitProductivity: { totalCommits: 0, totalPushes: 0, commitPushRatio: 0, totalOperations: 0, operationMix: [] },
    contextHealth: { uniqueRuleFiles: 0, ruleLoadsPerSession: 0, uniqueSkills: 0, skillList: [], modeDistribution: [], compactRate: 0, totalBlockers: 0, resolvedBlockers: 0, blockerResolutionRate: 0 },
    fileIntelligence: { readWriteRatio: 0, explorationDepth: 0, hotFiles: [], fileChurnRate: 0 },
    compositeScores: { productivity: 80, quality: 80, delegation: 80, contextHealth: 80 },
    insufficientData: false,
    ...overrides,
  };
}

describe('generateInsights', () => {
  it('returns empty array for minimal data', () => {
    const data = makeAnalyticsData();
    const insights = generateInsights(data);
    expect(insights).toEqual([]);
  });

  it('generates read-heavy insight when ratio > 5', () => {
    const data = makeAnalyticsData({
      totals: {
        ...makeAnalyticsData().totals,
        reads: 60, writes: 10, readWriteRatio: 6, totalEvents: 100,
      },
    });
    const insights = generateInsights(data);
    expect(insights.some(i => i.metric.includes('read'))).toBe(true);
    expect(insights.some(i => i.severity === 'neutral')).toBe(true);
  });

  it('generates healthy balance insight for good ratio', () => {
    const data = makeAnalyticsData({
      totals: {
        ...makeAnalyticsData().totals,
        reads: 15, writes: 10, readWriteRatio: 1.5, totalEvents: 50,
      },
    });
    const insights = generateInsights(data);
    expect(insights.some(i => i.severity === 'positive' && i.metric.includes('balance'))).toBe(true);
  });

  it('generates context overflow warning when compactRate > 60%', () => {
    const data = makeAnalyticsData({
      totals: {
        ...makeAnalyticsData().totals,
        totalSessions: 5, compactRate: 70, totalCompacts: 4,
      },
    });
    const insights = generateInsights(data);
    expect(insights.some(i => i.severity === 'warning' && i.metric.includes('context'))).toBe(true);
  });

  it('generates critical error insight when errorRate > 10%', () => {
    const data = makeAnalyticsData({
      totals: {
        ...makeAnalyticsData().totals,
        totalEvents: 50, totalErrors: 8, errorRate: 16,
      },
    });
    const insights = generateInsights(data);
    expect(insights.some(i => i.severity === 'critical')).toBe(true);
  });

  it('generates positive error insight when errorRate < 3%', () => {
    const data = makeAnalyticsData({
      totals: {
        ...makeAnalyticsData().totals,
        totalEvents: 100, totalErrors: 2, errorRate: 2,
      },
    });
    const insights = generateInsights(data);
    expect(insights.some(i => i.severity === 'positive' && i.metric.includes('power user'))).toBe(true);
  });

  it('generates commit rate insight for high output', () => {
    const data = makeAnalyticsData({
      totals: {
        ...makeAnalyticsData().totals,
        totalSessions: 5, totalCommits: 10, commitsPerSession: 2,
      },
    });
    const insights = generateInsights(data);
    expect(insights.some(i => i.metric.includes('commits per session'))).toBe(true);
  });
});

describe('generateCategoryInsights', () => {
  it('returns empty array for clean data', () => {
    const data = makeCategoryData({
      contextHealth: {
        ...makeCategoryData().contextHealth,
        uniqueRuleFiles: 1,
        ruleLoadsPerSession: 1,
      },
    });
    const insights = generateCategoryInsights(data);
    expect(insights).toEqual([]);
  });

  it('generates hot files warning when > 3 hot files', () => {
    const data = makeCategoryData({
      fileIntelligence: {
        readWriteRatio: 2, explorationDepth: 1, fileChurnRate: 0.5,
        hotFiles: [
          { file: '/src/a.ts', touches: 10 },
          { file: '/src/b.ts', touches: 8 },
          { file: '/src/c.ts', touches: 6 },
          { file: '/src/d.ts', touches: 5 },
        ],
      },
    });
    const insights = generateCategoryInsights(data);
    expect(insights.some(i => i.severity === 'warning' && i.metric.includes('hot files'))).toBe(true);
  });

  it('generates retry storm critical when >= 2 storms', () => {
    const data = makeCategoryData({
      errorIntelligence: {
        ...makeCategoryData().errorIntelligence,
        retryStorms: 3,
      },
    });
    const insights = generateCategoryInsights(data);
    expect(insights.some(i => i.severity === 'critical' && i.metric.includes('retry storm'))).toBe(true);
  });

  it('generates no CLAUDE.md warning when no rules', () => {
    const data = makeCategoryData({
      contextHealth: {
        ...makeCategoryData().contextHealth,
        uniqueRuleFiles: 0,
      },
    });
    const insights = generateCategoryInsights(data);
    expect(insights.some(i => i.metric.includes('CLAUDE.md') || i.metric.includes('rule files'))).toBe(true);
  });

  it('generates low productivity warning when score < 40', () => {
    const data = makeCategoryData({
      compositeScores: { productivity: 30, quality: 80, delegation: 80, contextHealth: 80 },
    });
    const insights = generateCategoryInsights(data);
    expect(insights.some(i => i.severity === 'warning' && i.metric.includes('Productivity'))).toBe(true);
  });

  it('does not generate insight for healthy scores', () => {
    const data = makeCategoryData({
      compositeScores: { productivity: 80, quality: 80, delegation: 80, contextHealth: 80 },
    });
    const insights = generateCategoryInsights(data);
    expect(insights.some(i => i.metric.includes('Productivity Score'))).toBe(false);
    expect(insights.some(i => i.metric.includes('Quality Score'))).toBe(false);
  });
});
