import {
  Brain, TrendingUp, AlertTriangle, CheckCircle,
  FileCode, GitBranch, Clock, Shield, Activity, Cpu,
  Users, MessageSquare, BookOpen, Wrench,
} from "lucide-react";
import type { AnalyticsData, CategoryAnalyticsData } from "@/lib/api";

export interface Insight {
  icon: React.ReactNode;
  severity: "positive" | "warning" | "critical" | "neutral";
  metric: string;
  evidence: string;
  action: string;
  roi: string;
}

export function generateInsights(d: AnalyticsData): Insight[] {
  const ins: Insight[] = [];
  const t = d.totals;

  if (t.reads + t.writes >= 5) {
    const ratio = t.readWriteRatio;
    if (ratio > 5) {
      ins.push({
        icon: <BookOpen className="h-5 w-5 text-blue-500" />, severity: "neutral",
        metric: `You read ${ratio}x more than you write`,
        evidence: `${t.reads} files read vs ${t.writes} files written. You're spending most of your AI time understanding code, not producing it.`,
        action: "Write a short plan before starting. Clarify what you want to change before reading everything.",
        roi: "Planning upfront typically reduces the number of file re-reads.",
      });
    } else if (ratio < 2 && ratio > 0) {
      ins.push({
        icon: <FileCode className="h-5 w-5 text-emerald-500" />, severity: "positive",
        metric: `Healthy balance: ${ratio}:1 read-to-write`,
        evidence: `You're reading just enough to write confidently. ${t.writes} files written with only ${t.reads} reads.`,
        action: "Keep this up — you're not over-analyzing or guessing blind.",
        roi: "This balance leads to fewer bugs on first attempt.",
      });
    }
  }

  if (t.totalSessions >= 3) {
    const pct = t.compactRate;
    if (pct > 60) {
      ins.push({
        icon: <Brain className="h-5 w-5 text-amber-500" />, severity: "warning",
        metric: `${pct}% of your sessions run out of context`,
        evidence: `${t.totalCompacts} times the agent had to compress your conversation. Each time, it forgets details from earlier work.`,
        action: "Start fresh sessions for new tasks instead of continuing long ones.",
        roi: `You'd recover ~${Math.round(t.totalCompacts * 3)} minutes of re-explaining lost context.`,
      });
    } else if (pct < 20 && t.totalSessions >= 5) {
      ins.push({
        icon: <CheckCircle className="h-5 w-5 text-emerald-500" />, severity: "positive",
        metric: `Only ${pct}% context overflow — you're efficient`,
        evidence: `${t.totalCompacts} compactions in ${t.totalSessions} sessions. Your tasks are well-scoped.`,
        action: "Share this pattern with your team — most developers hit 60%+.",
        roi: "Less context loss = less time re-explaining = faster completion.",
      });
    }
  }

  if (t.totalEvents >= 20) {
    const rate = t.errorRate;
    if (rate > 10) {
      ins.push({
        icon: <AlertTriangle className="h-5 w-5 text-red-500" />, severity: "critical",
        metric: `${rate}% of your tool calls fail`,
        evidence: `${t.totalErrors} errors in ${t.totalEvents} calls. That's a lot of wasted back-and-forth.`,
        action: "Check if the same error keeps repeating. Add a CLAUDE.md rule to prevent it.",
        roi: `Fixing this saves ~${Math.round(t.totalErrors * 2)} minutes of retry loops.`,
      });
    } else if (rate < 3) {
      ins.push({
        icon: <Shield className="h-5 w-5 text-emerald-500" />, severity: "positive",
        metric: `Only ${rate}% error rate — you're a power user`,
        evidence: `${t.totalErrors} errors in ${t.totalEvents} calls. Almost everything works on the first try.`,
        action: "Document your prompting style — others can learn from it.",
        roi: "Clean usage means more time building, less time debugging.",
      });
    }
  }

  if (t.totalSessions >= 2) {
    if (t.totalSubagents > 0 && d.subagents.bursts > 0) {
      ins.push({
        icon: <Users className="h-5 w-5 text-emerald-500" />, severity: "positive",
        metric: `You saved ~${d.subagents.timeSavedMin} min with parallel agents`,
        evidence: `${d.subagents.parallelCount} tasks ran simultaneously in ${d.subagents.bursts} bursts (up to ${d.subagents.maxConcurrent} at once).`,
        action: "Keep delegating research and exploration to subagents.",
        roi: "Parallel work is the single biggest time multiplier available to you.",
      });
    } else if (t.totalSubagents === 0 && t.totalEvents > 50) {
      ins.push({
        icon: <Users className="h-5 w-5 text-muted-foreground" />, severity: "neutral",
        metric: "Everything ran sequentially",
        evidence: `${t.totalEvents} events, zero parallel agents. You're doing one thing at a time.`,
        action: "Try subagents for research — fire 3-5 at once instead of doing them one by one.",
        roi: "One parallel burst can turn 10 minutes of research into 2 minutes.",
      });
    }
  }

  if (t.totalPrompts >= 5 && t.totalSessions >= 2) {
    const pps = t.promptsPerSession;
    if (pps < 3) {
      ins.push({
        icon: <MessageSquare className="h-5 w-5 text-emerald-500" />, severity: "positive",
        metric: `${pps} prompts per session — clear instructions`,
        evidence: `You give the agent clear, complete instructions. It works autonomously without needing constant guidance.`,
        action: "This is the ideal. Keep writing comprehensive upfront instructions.",
        roi: "Every avoided back-and-forth saves context for actual work.",
      });
    }
  }

  if (d.masteryTrend && d.masteryTrend.length >= 3) {
    const first = d.masteryTrend[0];
    const last = d.masteryTrend[d.masteryTrend.length - 1];
    if (last.error_rate < first.error_rate) {
      ins.push({
        icon: <TrendingUp className="h-5 w-5 text-emerald-500" />, severity: "positive",
        metric: "Your error rate is dropping — you're getting better",
        evidence: `Week 1: ${first.error_rate}%, Latest: ${last.error_rate}%. Consistent improvement over ${d.masteryTrend.length} weeks.`,
        action: "Keep refining your prompting patterns.",
        roi: "Lower errors = less retry time = faster completion.",
      });
    }
  }

  if (t.commitsPerSession > 1) {
    ins.push({
      icon: <GitBranch className="h-5 w-5 text-emerald-500" />, severity: "positive",
      metric: `${t.commitsPerSession} commits per session — high output`,
      evidence: `${t.totalCommits} total commits across ${t.totalSessions} sessions.`,
      action: "Maintain this shipping cadence.",
      roi: "Frequent commits reduce merge conflicts and context loss.",
    });
  }

  if (t.totalEditTestCycles > t.totalSessions * 2) {
    ins.push({
      icon: <Activity className="h-5 w-5 text-amber-500" />, severity: "warning",
      metric: `${t.totalEditTestCycles} edit-error cycles — lots of retry loops`,
      evidence: `${(t.totalEditTestCycles / t.totalSessions).toFixed(1)} cycles per session on average.`,
      action: "Write tests first, or add patterns to CLAUDE.md to prevent common errors.",
      roi: "Fewer retry loops means faster task completion.",
    });
  }

  if (t.totalTasks > 0 && t.totalSessions >= 2) {
    ins.push({
      icon: <Wrench className="h-5 w-5 text-blue-500" />, severity: "positive",
      metric: `${(t.totalTasks / t.totalSessions).toFixed(1)} tasks per session — you plan ahead`,
      evidence: `${t.totalTasks} structured tasks across ${t.totalSessions} sessions. You break work into steps.`,
      action: "Keep using tasks — they make sessions resumable after breaks.",
      roi: "Structured sessions are easier to resume and track progress.",
    });
  }

  return ins;
}

export function generateCategoryInsights(c: CategoryAnalyticsData): Insight[] {
  const ins: Insight[] = [];
  const cs = c.compositeScores;
  const ei = c.errorIntelligence;
  const del = c.delegation;
  const gov = c.governance;
  const ctx = c.contextHealth;
  const fi = c.fileIntelligence;
  const git = c.gitProductivity;
  const totalEvents = c.categories.reduce((a, b) => a + b.count, 0);

  if (fi.hotFiles.length > 3) {
    const top = fi.hotFiles[0];
    ins.push({
      icon: <AlertTriangle className="h-5 w-5 text-amber-500" />, severity: "warning",
      metric: `${fi.hotFiles.length} hot files with repeated edits`,
      evidence: `${top.file.split('/').pop()} was touched ${top.touches} times. Possible rework loop.`,
      action: "Read the full file before editing. Add constraints to CLAUDE.md.",
      roi: `Fewer re-edits save ~${fi.hotFiles.length * 3} minutes per session.`,
    });
  }

  if (ei.totalErrors > 3 && git.totalCommits === 0 && totalEvents > 50) {
    ins.push({
      icon: <AlertTriangle className="h-5 w-5 text-red-500" />, severity: "critical",
      metric: `${ei.totalErrors} errors, zero commits — session effort lost`,
      evidence: `${totalEvents} events with ${ei.totalErrors} errors and no commits. All effort was lost.`,
      action: "Review the error pattern, fix root cause, break tasks into smaller deliverable chunks.",
      roi: `Recovering from failed sessions costs an additional ${Math.round(totalEvents * 0.5)} minutes.`,
    });
  }

  if (git.totalCommits === 0 && totalEvents > 100) {
    ins.push({
      icon: <GitBranch className="h-5 w-5 text-amber-500" />, severity: "warning",
      metric: "No commits across all sessions",
      evidence: `${totalEvents} events recorded, zero commits. Work may not be reaching the codebase.`,
      action: "Commit incrementally — small commits are easier to review.",
      roi: "Regular commits create a safety net for rollbacks.",
    });
  }

  if (ei.totalErrors >= 5 && ei.resolutionRate > 80) {
    ins.push({
      icon: <CheckCircle className="h-5 w-5 text-emerald-500" />, severity: "positive",
      metric: `${ei.resolutionRate}% of errors resolved within session`,
      evidence: `${ei.resolvedErrors} of ${ei.totalErrors} errors fixed. Self-healing sessions.`,
      action: "Keep this up — self-healing sessions are the gold standard.",
      roi: "Each resolved error saves 5-10 min of next-session debugging.",
    });
  }

  if (ei.retryStorms >= 2) {
    ins.push({
      icon: <AlertTriangle className="h-5 w-5 text-red-500" />, severity: "critical",
      metric: `${ei.retryStorms} retry storm${ei.retryStorms > 1 ? 's' : ''} detected`,
      evidence: `Sessions where the same tool was called 3+ times with similar input. The agent gets stuck in loops.`,
      action: "Stop and re-think the approach. Add error context to CLAUDE.md.",
      roi: `Breaking retry loops saves ~${ei.retryStorms * 5} minutes of wasted compute.`,
    });
  }

  if (ei.totalErrors >= 5 && ei.resolutionRate < 30) {
    ins.push({
      icon: <AlertTriangle className="h-5 w-5 text-amber-500" />, severity: "warning",
      metric: `Only ${ei.resolutionRate}% of errors get resolved`,
      evidence: `${ei.totalErrors - ei.resolvedErrors} errors left unresolved. Technical debt accumulating.`,
      action: "Address root causes — add patterns to prevent recurring errors.",
      roi: `Resolving persistent errors prevents hours of future debugging.`,
    });
  }

  if (ei.p95LatencyMs > 15000 && ei.slowestTool) {
    ins.push({
      icon: <Clock className="h-5 w-5 text-amber-500" />, severity: "warning",
      metric: `${ei.slowestTool} averaging ${Math.round(ei.avgLatencyMs / 1000)}s — bottleneck`,
      evidence: `P95 latency: ${Math.round(ei.p95LatencyMs / 1000)}s. ${ei.latencyByTool.length} tools tracked for latency.`,
      action: "Check if tool can be replaced or if input can be simplified.",
      roi: `Fixing bottleneck saves ~${Math.round(ei.latencyByTool.reduce((a, t) => a + t.count, 0) * ei.avgLatencyMs / 60000)} minutes total.`,
    });
  }

  if (del.launched > 10 && del.completionRate > 70) {
    ins.push({
      icon: <Users className="h-5 w-5 text-emerald-500" />, severity: "positive",
      metric: `${del.launched} agents delegated — ${del.completionRate}% completion`,
      evidence: `${del.parallelBursts} parallel bursts, up to ${del.maxConcurrent} concurrent. ~${del.timeSavedMin} min saved.`,
      action: "Excellent use of parallelism. Share this pattern with the team.",
      roi: `Parallel delegation saved ~${del.timeSavedMin} minutes.`,
    });
  }

  if (del.launched === 0 && totalEvents > 50) {
    ins.push({
      icon: <Users className="h-5 w-5 text-muted-foreground" />, severity: "neutral",
      metric: "Everything ran sequentially — zero delegation",
      evidence: `${totalEvents} events, zero parallel agents. Single-threaded workflow.`,
      action: "Try subagents for research — fire 3-5 at once instead of one by one.",
      roi: "One parallel burst turns 10 minutes of research into 2 minutes.",
    });
  }

  if (del.launched >= 5 && del.completionRate < 60) {
    ins.push({
      icon: <AlertTriangle className="h-5 w-5 text-amber-500" />, severity: "warning",
      metric: `Only ${del.completionRate}% of agents complete successfully`,
      evidence: `${del.launched} launched, ${del.completed} completed. ${del.launched - del.completed} failed or timed out.`,
      action: "Simplify agent prompts. Break complex tasks into smaller units.",
      roi: "Higher completion = less wasted compute.",
    });
  }

  if (del.maxConcurrent >= 4) {
    ins.push({
      icon: <Cpu className="h-5 w-5 text-emerald-500" />, severity: "positive",
      metric: `Peak parallelism: ${del.maxConcurrent} agents simultaneously`,
      evidence: `${del.parallelBursts} bursts of parallel work. Maximum throughput achieved.`,
      action: "You're using the platform at full capacity. Well done.",
      roi: `Peak parallelism multiplies throughput by ${del.maxConcurrent}x.`,
    });
  }

  if (gov.totalRejections > 10) {
    const topRej = gov.topRejected[0];
    ins.push({
      icon: <Shield className="h-5 w-5 text-amber-500" />, severity: "warning",
      metric: `${gov.totalRejections} approaches rejected by user`,
      evidence: `Top rejected: ${topRej?.tool || 'unknown'} (${topRej?.count || 0} times). The agent keeps trying things you don't want.`,
      action: "Update CLAUDE.md with clearer constraints to prevent unwanted actions.",
      roi: `Better rules prevent ${gov.totalRejections} unnecessary tool calls.`,
    });
  }

  if (git.totalCommits > 0 && ei.totalErrors < 3) {
    ins.push({
      icon: <CheckCircle className="h-5 w-5 text-emerald-500" />, severity: "positive",
      metric: `Productive sessions — ${git.totalCommits} commits, clean exit`,
      evidence: `${git.totalCommits} commits with only ${ei.totalErrors} errors. Work shipped successfully.`,
      action: "Document what made this session productive — replicate the pattern.",
      roi: "Productive sessions compound. Each clean commit is future-proof.",
    });
  }

  if (gov.planApproved + gov.planRejected > 0 && gov.planApprovalRate > 80) {
    ins.push({
      icon: <CheckCircle className="h-5 w-5 text-emerald-500" />, severity: "positive",
      metric: `${gov.planApprovalRate}% of plans approved on first try`,
      evidence: `${gov.planApproved} plans approved, ${gov.planRejected} rejected. Strong alignment.`,
      action: "Strong planning discipline. Keep using plan mode for complex tasks.",
      roi: "Approved plans mean fewer mid-session course corrections.",
    });
  }

  if (ei.totalErrors > 0 && totalEvents > 30) {
    const errorPct = Math.round(1000 * ei.totalErrors / totalEvents) / 10;
    if (errorPct > 15) {
      ins.push({
        icon: <AlertTriangle className="h-5 w-5 text-red-500" />, severity: "warning",
        metric: `${errorPct}% error rate — ${ei.totalErrors} errors in ${totalEvents} events`,
        evidence: `Error rate is above 15%. Most tools should succeed on first try. High error rate wastes compute.`,
        action: "Check repeating errors. Add error patterns to CLAUDE.md to prevent them.",
        roi: `Fixing the top error source saves ~${Math.round(ei.totalErrors * 1.5)} minutes of retry loops.`,
      });
    }
  }

  if (ctx.uniqueRuleFiles > 0 && ctx.ruleLoadsPerSession > 1) {
    ins.push({
      icon: <FileCode className="h-5 w-5 text-emerald-500" />, severity: "positive",
      metric: `${ctx.uniqueRuleFiles} rule files loaded consistently`,
      evidence: `${ctx.ruleLoadsPerSession.toFixed(1)} loads per session. Rules are guiding behavior.`,
      action: "Consistent rule loading means consistent behavior.",
      roi: "Rules prevent the top error patterns.",
    });
  }

  if (ctx.uniqueRuleFiles === 0) {
    ins.push({
      icon: <FileCode className="h-5 w-5 text-amber-500" />, severity: "warning",
      metric: "No CLAUDE.md or rule files detected",
      evidence: "The agent runs without project-specific instructions.",
      action: "Create a CLAUDE.md with project conventions, constraints, and patterns.",
      roi: "Projects with CLAUDE.md consistently show lower error rates.",
    });
  }

  if (ctx.totalBlockers > 0 && ctx.blockerResolutionRate < 50) {
    ins.push({
      icon: <AlertTriangle className="h-5 w-5 text-red-500" />, severity: "critical",
      metric: `${ctx.totalBlockers - ctx.resolvedBlockers} unresolved blockers`,
      evidence: `Only ${ctx.blockerResolutionRate}% of blockers resolved. Open items: ${ctx.totalBlockers - ctx.resolvedBlockers}.`,
      action: "Document blockers for the next session or escalate.",
      roi: "Unresolved blockers multiply in cost over time.",
    });
  }

  if (ctx.uniqueRuleFiles > 0 && ei.totalErrors > 0 && ei.resolutionRate > 50) {
    ins.push({
      icon: <FileCode className="h-5 w-5 text-emerald-500" />, severity: "positive",
      metric: "CLAUDE.md loaded + errors resolving — rules are working",
      evidence: `${ctx.uniqueRuleFiles} rule files loaded, ${ei.resolutionRate}% error resolution rate. Rules correlate with self-healing sessions.`,
      action: "Update CLAUDE.md when you discover new error patterns — each rule prevents future errors.",
      roi: "Sessions with rules loaded show measurably higher error resolution rates.",
    });
  }
  if (ctx.uniqueRuleFiles === 0 && ei.totalErrors > 5) {
    ins.push({
      icon: <FileCode className="h-5 w-5 text-red-500" />, severity: "critical",
      metric: `No CLAUDE.md + ${ei.totalErrors} errors — rules would prevent this`,
      evidence: `${ei.totalErrors} errors without any project rules loaded. CLAUDE.md is the #1 way to reduce errors.`,
      action: "Create CLAUDE.md with error patterns, constraints, and project conventions.",
      roi: "Adding CLAUDE.md is the single most impactful action for reducing errors.",
    });
  }

  if (fi.hotFiles.length > 0 && fi.hotFiles[0].touches > 8) {
    const worst = fi.hotFiles[0];
    ins.push({
      icon: <AlertTriangle className="h-5 w-5 text-red-500" />, severity: "warning",
      metric: `${worst.file.split('/').pop()} touched ${worst.touches} times — persistent struggle`,
      evidence: `File edited ${worst.touches} times across sessions. This suggests unclear requirements or wrong approach.`,
      action: "Write a spec or test first. Consider if the approach needs rethinking entirely.",
      roi: `Spec-first approach reduces rework from ${worst.touches} to ~3 edits.`,
    });
  }

  if (cs.productivity < 40) {
    ins.push({
      icon: <TrendingUp className="h-5 w-5 text-amber-500" />, severity: "warning",
      metric: `Productivity Score: ${cs.productivity}/100 — room to improve`,
      evidence: `Low commit rate or high rework. Consider structured planning before execution.`,
      action: "Start sessions with a plan. Commit incrementally. Delegate research to agents.",
      roi: "Planning + committing incrementally improves output consistency.",
    });
  }
  if (cs.quality < 40) {
    ins.push({
      icon: <Shield className="h-5 w-5 text-red-500" />, severity: "critical",
      metric: `Quality Score: ${cs.quality}/100 — needs attention`,
      evidence: `High error rate or unresolved errors. Retry loops detected.`,
      action: "Add error patterns to CLAUDE.md. Write tests first. Break retry loops early.",
      roi: "Addressing error patterns in-session prevents them from recurring.",
    });
  }
  if (cs.contextHealth < 40) {
    ins.push({
      icon: <Brain className="h-5 w-5 text-amber-500" />, severity: "warning",
      metric: `Context Health: ${cs.contextHealth}/100 — agent lacks guidance`,
      evidence: `Missing rules, few skills, no plans. The agent works without context.`,
      action: "Create CLAUDE.md, use plan mode, try skills like /commit.",
      roi: "Better context hygiene directly correlates with fewer errors.",
    });
  }

  return ins;
}
