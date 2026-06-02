import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { api, type AnalyticsData, type CategoryAnalyticsData } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { InsightCard, Stat, RatioBar, Mini } from "@/components/dashboard-widgets";
import { generateInsights, generateCategoryInsights } from "@/lib/insights";
import {
  Brain, TrendingUp, AlertTriangle,
  Zap, FileCode, GitBranch, Clock, Shield, Activity, Cpu,
  Lightbulb, BookOpen, MessageSquare, Search,
  FolderOpen, Code,
} from "lucide-react";

export const Route = createFileRoute("/")({ component: Dashboard });

const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];

const SEV_ORDER = { critical: 0, warning: 1, positive: 2, neutral: 3 };

function Dashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [catData, setCatData] = useState<CategoryAnalyticsData | null>(null);
  const [showAllInsights, setShowAllInsights] = useState(false);

  useEffect(() => {
    api.analytics().then(setData);
    api.categoryAnalytics().then(setCatData).catch(() => {});
  }, []);

  const allInsights = useMemo(() => {
    if (!data) return [];
    const baseInsights = generateInsights(data);
    const categoryInsights = catData ? generateCategoryInsights(catData) : [];
    const combined = [...baseInsights, ...categoryInsights];
    combined.sort((a, b) => (SEV_ORDER[a.severity] ?? 4) - (SEV_ORDER[b.severity] ?? 4));
    return combined;
  }, [data, catData]);

  const derivedValues = useMemo(() => {
    if (!data) return null;
    return {
      topTool: data.toolUsage[0],
      topMcp: data.mcpTools[0],
      peakHour: data.hourlyPattern.reduce((max, h) => h.count > (max?.count || 0) ? h : max, data.hourlyPattern[0]),
      topProject: data.projectActivity[0],
      topFile: data.fileActivity[0],
    };
  }, [data]);

  if (!data || !derivedValues) return <p className="text-muted-foreground animate-pulse">Loading analytics...</p>;

  const t = data.totals;
  const insights = showAllInsights ? allInsights : allInsights.slice(0, 8);
  const { topTool, topMcp, peakHour, topProject, topFile } = derivedValues;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">Personal insights · {t.totalSessions} sessions · {t.totalEvents} events</p>
      </div>

      <div className="space-y-6">

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Sessions" value={t.totalSessions} sub={`${t.avgSessionMin} min avg`} icon={Zap} color="text-blue-500" />
        <Stat label="Read:Write" value={`${t.readWriteRatio}:1`} sub={`${t.reads}R / ${t.writes}W`} icon={BookOpen} color="text-purple-500" />
        <Stat label="Compact Rate" value={`${t.compactRate}%`} sub={`${t.totalCompacts} compactions`} icon={Brain} color={t.compactRate > 60 ? "text-amber-500" : "text-emerald-500"} />
        <Stat label="Error Rate" value={`${t.errorRate}%`} sub={`${t.totalErrors} errors`} icon={Shield} color={t.errorRate > 10 ? "text-red-500" : "text-emerald-500"} />
        <Stat label="Prompts" value={t.promptsPerSession} sub="per session" icon={MessageSquare} color="text-cyan-500" />
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Insights & Actions</h3>
            <Badge variant="secondary" className="text-[10px]">{insights.length}</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {insights.map((ins, i) => <InsightCard key={i} {...ins} />)}
          </div>
          {allInsights.length > 8 && (
            <button
              onClick={() => setShowAllInsights(!showAllInsights)}
              className="mt-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAllInsights ? "Show less" : `Show all ${allInsights.length} insights`}
            </button>
          )}
        </div>
      )}

      <Separator />

      {/* ── Tool Usage ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              <CardTitle className="text-sm">Tool Usage</CardTitle>
            </div>
            <CardDescription>What the agent does for you</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <Mini label="Total Calls" value={t.totalEvents} />
              <Mini label="Top Tool" value={topTool?.tool || "-"} color="text-blue-500" />
              <Mini label="Tools Used" value={data.toolUsage.length} color="text-purple-500" />
            </div>
            <div className="space-y-2">
              {data.toolUsage.slice(0, 8).map((tool, i) => {
                const pct = Math.round(100 * tool.count / t.totalEvents);
                return (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="font-medium">{tool.tool}</span>
                      <span className="text-muted-foreground tabular-nums">{tool.count} <span className="text-muted-foreground/50">({pct}%)</span></span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ── MCP Tools ── */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Code className="h-4 w-4 text-purple-500" />
              <CardTitle className="text-sm">context-mode Tools</CardTitle>
            </div>
            <CardDescription>How you use the sandbox</CardDescription>
          </CardHeader>
          <CardContent>
            {data.mcpTools.length > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <Mini label="MCP Calls" value={data.mcpTools.reduce((a, b) => a + b.count, 0)} />
                  <Mini label="Top Tool" value={topMcp?.tool || "-"} color="text-purple-500" />
                  <Mini label="Tools Used" value={data.mcpTools.length} color="text-cyan-500" />
                </div>
                <RatioBar items={data.mcpTools.slice(0, 6).map((m, i) => ({
                  label: m.tool, value: m.count, color: COLORS[i % COLORS.length],
                }))} />
                <div className="mt-4 space-y-1.5">
                  {data.mcpTools.slice(0, 6).map((m, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-xs font-mono">{m.tool}</span>
                      <Badge variant="outline" className="text-[10px] tabular-nums">{m.count}</Badge>
                    </div>
                  ))}
                </div>
              </>
            ) : <p className="text-sm text-muted-foreground text-center py-12">No MCP data yet</p>}
          </CardContent>
        </Card>
      </div>

      {/* ── Session Activity + When You Code ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-500" />
              <CardTitle className="text-sm">Session Activity</CardTitle>
            </div>
            <CardDescription>Your AI usage over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <Mini label="Total" value={t.totalSessions} />
              <Mini label="Avg Duration" value={`${t.avgSessionMin}m`} color="text-blue-500" />
              <Mini label="Active Days" value={data.sessionsByDate.length} color="text-emerald-500" />
            </div>
            {data.sessionsByDate.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-border">
                {data.sessionsByDate.slice(-7).map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground tabular-nums min-w-[60px]">{d.date?.slice(5)}</span>
                    <div className="flex-1 flex gap-0.5">
                      {Array.from({ length: d.count }).map((_, j) => (
                        <div key={j} className="w-5 h-5 rounded-sm bg-blue-500/80" />
                      ))}
                      {d.compacts > 0 && Array.from({ length: d.compacts }).map((_, j) => (
                        <div key={`c${j}`} className="w-5 h-5 rounded-sm bg-amber-500/60" />
                      ))}
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {d.count}s{d.compacts > 0 ? ` ${d.compacts}c` : ""}
                    </span>
                  </div>
                ))}
                <div className="flex gap-4 mt-2">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-blue-500/80" /> Sessions
                  </span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-amber-500/60" /> Compactions
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── When You Code ── */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-cyan-500" />
              <CardTitle className="text-sm">When You Code</CardTitle>
            </div>
            <CardDescription>Schedule deep work at your peak hours</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <Mini label="Peak Hour" value={peakHour ? `${String(peakHour.hour).padStart(2, "0")}:00` : "-"} color="text-cyan-500" />
              <Mini label="Peak Events" value={peakHour?.count || 0} />
              <Mini label="Active Hours" value={data.hourlyPattern.filter(h => h.count > 0).length} />
            </div>
            <div className="pt-2 border-t border-border">
              <div className="grid grid-cols-12 gap-1">
                {Array.from({ length: 24 }, (_, i) => {
                  const h = data.hourlyPattern.find(p => p.hour === i);
                  const count = h?.count || 0;
                  const max = peakHour?.count || 1;
                  const opacity = count > 0 ? 0.2 + 0.8 * (count / max) : 0.05;
                  return (
                    <div key={i} className="flex flex-col items-center gap-0.5">
                      <div
                        className="w-full aspect-square rounded-sm transition-all"
                        style={{ background: count > 0 ? `rgba(6, 182, 212, ${opacity})` : "hsl(var(--secondary))" }}
                        title={`${String(i).padStart(2, "0")}:00 — ${count} events`}
                      />
                      {i % 4 === 0 && <span className="text-[8px] text-muted-foreground/50">{i}</span>}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[9px] text-muted-foreground">00:00</span>
                <span className="text-[9px] text-muted-foreground">12:00</span>
                <span className="text-[9px] text-muted-foreground">23:00</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Project Focus + Hot Files ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-emerald-500" />
              <CardTitle className="text-sm">Project Focus</CardTitle>
            </div>
            <CardDescription>Where your AI time goes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <Mini label="Projects" value={t.uniqueProjects} />
              <Mini label="Top Project" value={topProject?.project_dir === "__unknown__" ? "Unknown" : topProject?.project_dir?.split("/").pop() || "-"} color="text-emerald-500" />
            </div>
            {data.attribution?.isFallbackOnly && (
              <div className="mb-3 px-3 py-2 rounded-md bg-muted/50 border border-border text-xs text-muted-foreground flex items-center gap-1.5">
                <Lightbulb className="h-3 w-3 shrink-0" />
                Some project times are estimated
              </div>
            )}
            <div className="space-y-2.5 pt-2 border-t border-border">
              {data.projectActivity.slice(0, 6).map((p, i) => {
                const maxEv = data.projectActivity[0]?.events || 1;
                const pct = Math.round((p.events / maxEv) * 100);
                const name = p.project_dir === "__unknown__" ? "Unknown" : p.project_dir?.split("/").filter(Boolean).slice(-2).join("/") || "Unknown";
                return (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-mono truncate max-w-[200px]">{name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {p.sessions} sessions · {p.events} events
                      </span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileCode className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-sm">Hot Files</CardTitle>
            </div>
            <CardDescription>Most interacted — candidates for better tooling</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <Mini label="Files" value={data.fileActivity.length} />
              <Mini label="Top File" value={topFile?.file?.split("/").pop() || "-"} color="text-amber-500" />
              <Mini label="Top Hits" value={topFile?.count || 0} />
            </div>
            <div className="space-y-1 pt-2 border-t border-border">
              {data.fileActivity.slice(0, 8).map((f, i) => {
                const parts = f.file?.split("/") || [];
                const name = parts.pop() || f.file;
                const dir = parts.slice(-2).join("/");
                return (
                  <div key={i} className="flex items-center gap-2 py-0.5">
                    <Badge variant="outline" className="text-[10px] min-w-[28px] justify-center tabular-nums">{f.count}</Badge>
                    <span className="text-xs font-mono truncate">
                      {dir && <span className="text-muted-foreground/60">{dir}/</span>}{name}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Explore/Execute + Work Modes ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {data.exploreExecRatio.total > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-blue-500" />
                <CardTitle className="text-sm">Explore vs Execute</CardTitle>
              </div>
              <CardDescription>Reading code vs writing code — your work balance</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const { explore, execute, total } = data.exploreExecRatio;
                const ratio = execute > 0 ? (explore / execute).toFixed(1) : explore;
                const explorePct = Math.round(100 * explore / Math.max(total, 1));
                const executePct = 100 - explorePct;
                return (
                  <>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <Mini label="Explore" value={explore} color="text-blue-500" />
                      <Mini label="Execute" value={execute} color="text-emerald-500" />
                      <Mini label="Ratio" value={`${ratio}:1`} color={Number(ratio) > 6 ? "text-amber-500" : "text-foreground"} />
                    </div>
                    <RatioBar items={[
                      { label: `Read/Glob/Grep (${explorePct}%)`, value: explore, color: "#3b82f6" },
                      { label: `Write/Edit (${executePct}%)`, value: execute, color: "#10b981" },
                    ]} />
                  </>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {data.workModes.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-purple-500" />
                <CardTitle className="text-sm">Work Modes</CardTitle>
              </div>
              <CardDescription>How you approach tasks — investigate, implement, review, explore</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const total = data.workModes.reduce((a, b) => a + b.count, 0);
                return (
                  <>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <Mini label="Total Intents" value={total} />
                      <Mini label="Top Mode" value={data.workModes[0]?.mode || "-"} color="text-purple-500" />
                      <Mini label="Modes" value={data.workModes.length} />
                    </div>
                    <RatioBar items={data.workModes.map((m, i) => ({
                      label: m.mode, value: m.count, color: COLORS[i % COLORS.length],
                    }))} />
                  </>
                );
              })()}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Tool Mastery + Commit Rate ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <CardTitle className="text-sm">Tool Mastery</CardTitle>
            </div>
            <CardDescription>Are you getting better over time?</CardDescription>
          </CardHeader>
          <CardContent>
            {data.masteryTrend && data.masteryTrend.length > 0 ? (() => {
              const last = data.masteryTrend[data.masteryTrend.length - 1];
              const first = data.masteryTrend[0];
              const improving = last.error_rate < first.error_rate;
              return (
                <>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <Mini label="Weeks" value={data.masteryTrend.length} />
                    <Mini label="Latest" value={`${last.error_rate}%`} color={last.error_rate < 5 ? "text-emerald-500" : last.error_rate > 10 ? "text-amber-500" : ""} />
                    <Mini label="Trend" value={improving ? "\u2193" : "\u2191"} color={improving ? "text-emerald-500" : "text-red-500"} />
                  </div>
                  <div className="space-y-1.5 pt-2 border-t border-border">
                    {data.masteryTrend.slice(-6).map((w, i) => {
                      const maxRate = Math.max(...data.masteryTrend.map(m => m.error_rate), 1);
                      const pct = Math.round((w.error_rate / maxRate) * 100);
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground tabular-nums min-w-[50px]">{w.week?.slice(5)}</span>
                          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 3)}%`, background: w.error_rate < 5 ? "#10b981" : w.error_rate > 10 ? "#f59e0b" : "#3b82f6" }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground tabular-nums">{w.error_rate}%</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                    {last.error_rate === 0 && first.error_rate <= 1
                      ? "Near-zero error rate across all weeks — you're writing precise, clean prompts."
                      : improving
                      ? `Error rate dropped from ${first.error_rate}% to ${last.error_rate}% — your skills are improving.`
                      : `Error rate went from ${first.error_rate}% to ${last.error_rate}%. Check what changed — new tools, different project, or prompt drift?`}
                  </p>
                </>
              );
            })() : <p className="text-sm text-muted-foreground text-center py-12">Not enough data yet</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-emerald-500" />
              <CardTitle className="text-sm">Commit Rate</CardTitle>
            </div>
            <CardDescription>How productive are your sessions?</CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const commits = t.totalCommits || 0;
              const perSession = t.commitsPerSession || 0;
              const sessionsWithCommit = data.commitRate ? data.commitRate.filter(c => c.commits > 0).length : 0;
              return (
                <>
                  <div className="grid grid-cols-3 gap-4 mb-3">
                    <Mini label="Commits" value={commits} />
                    <Mini label="Per Session" value={perSession} color={perSession >= 1 ? "text-emerald-500" : "text-muted-foreground"} />
                    <Mini label="Sessions w/ Commit" value={sessionsWithCommit} color="text-blue-500" />
                  </div>
                  <div className="pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {perSession >= 1
                        ? "Strong output — you're committing consistently every session."
                        : perSession > 0
                        ? `${commits} commit in ${t.totalSessions} sessions. Most sessions are research/exploration — commits come in focused bursts.`
                        : "No commits yet. That's fine if you're in exploration or debugging mode — commits will come when you ship."}
                    </p>
                  </div>
                </>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* ── Rules Health + Edit-Test Cycles ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileCode className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-sm">Rules Health</CardTitle>
            </div>
            <CardDescription>Are your instruction files maintained?</CardDescription>
          </CardHeader>
          <CardContent>
            {data.rulesFreshness && data.rulesFreshness.length > 0 ? (() => {
              const top = data.rulesFreshness[0];
              const topName = top.rule_path?.split("/").pop() || top.rule_path;
              return (
                <>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <Mini label="Rules" value={t.totalRules || data.rulesFreshness.length} />
                    <Mini label="Most Loaded" value={topName} color="text-amber-500" />
                    <Mini label="Loads" value={top.load_count} />
                  </div>
                  <div className="space-y-1.5 pt-2 border-t border-border">
                    {data.rulesFreshness.slice(0, 6).map((r, i) => {
                      const name = r.rule_path?.split("/").pop() || r.rule_path;
                      const lastSeen = r.last_seen ? (() => {
                        const diff = Date.now() - new Date(r.last_seen).getTime();
                        const days = Math.floor(diff / 86400000);
                        return days === 0 ? "today" : days === 1 ? "1d ago" : `${days}d ago`;
                      })() : "unknown";
                      return (
                        <div key={i} className="flex items-center justify-between py-0.5">
                          <span className="text-xs font-mono truncate max-w-[200px]">{name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">{lastSeen}</span>
                            <Badge variant="outline" className="text-[10px] tabular-nums">{r.load_count}</Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })() : <p className="text-sm text-muted-foreground text-center py-12">No rules data yet</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-sm">Edit → Error Cycles</CardTitle>
            </div>
            <CardDescription>Write → fail → fix again loops</CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const cycles = t.totalEditTestCycles || 0;
              const perSession = t.totalSessions > 0 ? (cycles / t.totalSessions).toFixed(1) : "0";
              const sessionsHit = data.editTestCycles ? data.editTestCycles.length : 0;

              if (cycles === 0) {
                return (
                  <div className="pt-2">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="h-5 w-5 text-emerald-500" />
                      <span className="text-sm font-semibold">Zero retry loops</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      No write→error→rewrite patterns detected. Your code works on the first try — clean prompting and clear instructions pay off.
                    </p>
                  </div>
                );
              }

              return (
                <>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <Mini label="Total Cycles" value={cycles} />
                    <Mini label="Per Session" value={perSession} color={Number(perSession) > 3 ? "text-amber-500" : "text-emerald-500"} />
                    <Mini label="Sessions Hit" value={sessionsHit} />
                  </div>
                  <div className="pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {Number(perSession) > 3
                        ? "High retry rate — consider writing tests first or adding patterns to CLAUDE.md to prevent common errors."
                        : `${cycles} retry loops across ${sessionsHit} sessions. Manageable — keep an eye on which files trigger retries.`}
                    </p>
                  </div>
                </>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* ── Git Flow + Parallel Work ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {data.gitActivity.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-emerald-500" />
                <CardTitle className="text-sm">Git Flow</CardTitle>
              </div>
              <CardDescription>Your version control pattern per session</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const commits = data.gitActivity.filter(g => g.action === "commit").length;
                const pushes = data.gitActivity.filter(g => g.action === "push").length;
                const sessions = new Map<string, { project: string; actions: string[]; time: string }>();
                data.gitActivity.forEach(g => {
                  if (!sessions.has(g.session_id)) {
                    sessions.set(g.session_id, {
                      project: g.project_dir === "__unknown__" ? "Unknown" : g.project_dir?.split("/").filter(Boolean).slice(-2).join("/") || "-",
                      actions: [],
                      time: g.created_at,
                    });
                  }
                  sessions.get(g.session_id)!.actions.push(g.action);
                });
                return (
                  <>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <Mini label="Git Ops" value={data.gitActivity.length} />
                      <Mini label="Commits" value={commits} color="text-emerald-500" />
                      <Mini label="Pushes" value={pushes} color="text-blue-500" />
                    </div>
                    <div className="space-y-2.5 pt-2 border-t border-border">
                      {[...sessions.entries()].slice(0, 5).map(([sid, s]) => (
                        <div key={sid}>
                          <div className="flex justify-between text-[10px] mb-1">
                            <span className="font-mono text-muted-foreground">{s.project}</span>
                            <span className="text-muted-foreground">{s.time?.slice(5, 16)}</span>
                          </div>
                          <div className="flex gap-1">
                            {s.actions.map((a, i) => (
                              <Badge key={i} variant={a === "commit" || a === "push" ? "default" : "secondary"} className="text-[9px]">{a}</Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {data.subagents.total > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-purple-500" />
                <CardTitle className="text-sm">Parallel Work</CardTitle>
              </div>
              <CardDescription>How effectively you delegate to subagents</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <Mini label="Delegated" value={data.subagents.total} />
                <Mini label="Max Parallel" value={data.subagents.maxConcurrent} color="text-purple-500" />
                <Mini label="Time Saved" value={`~${data.subagents.timeSavedMin}m`} color="text-emerald-500" />
              </div>
              <RatioBar items={[
                { label: "Parallel", value: data.subagents.parallelCount, color: "#8b5cf6" },
                { label: "Sequential", value: data.subagents.sequentialCount, color: "hsl(var(--muted))" },
              ]} />
              {data.subagents.burstDetails.length > 0 && (
                <div className="space-y-1.5 pt-3 mt-3 border-t border-border">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Parallel Bursts</p>
                  {data.subagents.burstDetails.map((b: { size: number; time: string }, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground tabular-nums">{b.time?.slice(5, 16)}</span>
                      <div className="flex gap-0.5">
                        {Array.from({ length: b.size }).map((_, j) => (
                          <div key={j} className="w-3 h-3 rounded-sm bg-purple-500/80" />
                        ))}
                      </div>
                      <span className="text-[10px] text-muted-foreground">{b.size} agents</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {catData && !catData.insufficientData && (
        <>
          <Separator />

          {/* ── Category Intelligence ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="h-4 w-4 text-purple-500" />
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Session Intelligence</h3>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <Card className={catData.compositeScores.productivity >= 70 ? "border-emerald-500/30" : catData.compositeScores.productivity < 40 ? "border-red-500/30" : "border-amber-500/30"}>
                <CardContent className="pt-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold tabular-nums">{catData.compositeScores.productivity}</div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Productivity</p>
                  </div>
                </CardContent>
              </Card>
              <Card className={catData.compositeScores.quality >= 70 ? "border-emerald-500/30" : catData.compositeScores.quality < 40 ? "border-red-500/30" : "border-amber-500/30"}>
                <CardContent className="pt-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold tabular-nums">{catData.compositeScores.quality}</div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Quality</p>
                  </div>
                </CardContent>
              </Card>
              <Card className={catData.compositeScores.delegation >= 70 ? "border-emerald-500/30" : catData.compositeScores.delegation < 40 ? "border-red-500/30" : "border-amber-500/30"}>
                <CardContent className="pt-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold tabular-nums">{catData.compositeScores.delegation}</div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Delegation</p>
                  </div>
                </CardContent>
              </Card>
              <Card className={catData.compositeScores.contextHealth >= 70 ? "border-emerald-500/30" : catData.compositeScores.contextHealth < 40 ? "border-red-500/30" : "border-amber-500/30"}>
                <CardContent className="pt-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold tabular-nums">{catData.compositeScores.contextHealth}</div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Context Health</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-500" />
                    <CardTitle className="text-sm">Event Categories</CardTitle>
                  </div>
                  <CardDescription>{catData.categories.reduce((a, b) => a + b.count, 0)} events across {catData.categories.filter(c => c.count > 0).length} categories</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {catData.categories.filter(c => c.count > 0).sort((a, b) => b.count - a.count).slice(0, 12).map((cat, i) => {
                      const max = catData.categories.reduce((a, b) => Math.max(a, b.count), 0);
                      return (
                        <div key={cat.category} className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground w-28 truncate">{cat.category}</span>
                          <div className="flex-1 h-5 bg-muted/50 rounded-sm overflow-hidden">
                            <div className="h-full rounded-sm" style={{ width: `${(cat.count / max) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                          </div>
                          <span className="text-[11px] tabular-nums text-muted-foreground w-8 text-right">{cat.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-red-500" />
                    <CardTitle className="text-sm">Error Intelligence</CardTitle>
                  </div>
                  <CardDescription>Resolution rate, retry storms, latency</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <Mini label="Errors" value={catData.errorIntelligence.totalErrors} />
                    <Mini label="Resolved" value={`${catData.errorIntelligence.resolutionRate}%`} color={catData.errorIntelligence.resolutionRate > 70 ? "text-emerald-500" : "text-amber-500"} />
                    <Mini label="Retry Storms" value={catData.errorIntelligence.retryStorms} color={catData.errorIntelligence.retryStorms > 0 ? "text-red-500" : ""} />
                  </div>
                  {catData.errorIntelligence.latencyByTool.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Slowest Tools</p>
                      {catData.errorIntelligence.latencyByTool.slice(0, 5).map((t) => (
                        <div key={t.tool} className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground w-20 truncate">{t.tool}</span>
                          <div className="flex-1 h-4 bg-muted/50 rounded-sm overflow-hidden">
                            <div className="h-full bg-amber-500/60 rounded-sm" style={{ width: `${Math.min((t.avg_ms / 30000) * 100, 100)}%` }} />
                          </div>
                          <span className="text-[11px] tabular-nums text-muted-foreground w-12 text-right">{(t.avg_ms / 1000).toFixed(1)}s</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {catData.errorIntelligence.topErrorTools.length > 0 && (
                    <div className="space-y-1.5 mt-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Top Error Sources</p>
                      {catData.errorIntelligence.topErrorTools.slice(0, 5).map((t) => (
                        <div key={t.tool} className="flex items-center justify-between">
                          <span className="text-[11px] text-muted-foreground">{t.tool}</span>
                          <Badge variant="secondary" className="text-[10px]">{t.count}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-purple-500" />
                  <CardTitle className="text-sm">Governance</CardTitle>
                </div>
                <CardDescription>Decisions, rejections, plans, constraints</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <Mini label="Rejections" value={catData.governance.totalRejections} color={catData.governance.totalRejections > 20 ? "text-amber-500" : ""} />
                  <Mini label="Decisions" value={catData.governance.totalDecisions} />
                  <Mini label="Plans Approved" value={catData.governance.planApproved} />
                  <Mini label="Constraints" value={catData.governance.totalConstraints} />
                </div>
                {catData.governance.topRejected.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Top Rejected Tools</p>
                    {catData.governance.topRejected.slice(0, 5).map((t) => (
                      <div key={t.tool} className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">{t.tool}</span>
                        <Badge variant="secondary" className="text-[10px]">{t.count}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-emerald-500" />
                  <CardTitle className="text-sm">Delegation</CardTitle>
                </div>
                <CardDescription>Agent parallelism and completion</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <Mini label="Launched" value={catData.delegation.launched} />
                  <Mini label="Completed" value={catData.delegation.completed} />
                  <Mini label="Rate" value={`${catData.delegation.completionRate}%`} color={catData.delegation.completionRate > 70 ? "text-emerald-500" : "text-amber-500"} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Mini label="Bursts" value={catData.delegation.parallelBursts} />
                  <Mini label="Max ∥" value={catData.delegation.maxConcurrent} />
                  <Mini label="Saved" value={`${catData.delegation.timeSavedMin}m`} color="text-emerald-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Separator />

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-blue-500" />
                  <CardTitle className="text-sm">Git Productivity</CardTitle>
                </div>
                <CardDescription>Commit patterns and operation mix</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <Mini label="Commits" value={catData.gitProductivity.totalCommits} />
                  <Mini label="Pushes" value={catData.gitProductivity.totalPushes} />
                  <Mini label="C:P Ratio" value={catData.gitProductivity.commitPushRatio > 0 ? `${catData.gitProductivity.commitPushRatio}:1` : "—"} />
                </div>
                {catData.gitProductivity.operationMix.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Git Operations</p>
                    {catData.gitProductivity.operationMix.slice(0, 8).map((op) => {
                      const max = catData.gitProductivity.operationMix[0]?.count || 1;
                      return (
                        <div key={op.operation} className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground w-16 truncate">{op.operation}</span>
                          <div className="flex-1 h-4 bg-muted/50 rounded-sm overflow-hidden">
                            <div className="h-full bg-blue-500/60 rounded-sm" style={{ width: `${(op.count / max) * 100}%` }} />
                          </div>
                          <span className="text-[11px] tabular-nums text-muted-foreground w-6 text-right">{op.count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-cyan-500" />
                  <CardTitle className="text-sm">Context Health</CardTitle>
                </div>
                <CardDescription>Rules, skills, work modes, blockers</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <Mini label="Rule Files" value={catData.contextHealth.uniqueRuleFiles} />
                  <Mini label="Skills" value={catData.contextHealth.uniqueSkills} />
                  <Mini label="Compact Rate" value={`${catData.contextHealth.compactRate}%`} color={catData.contextHealth.compactRate > 60 ? "text-amber-500" : "text-emerald-500"} />
                </div>
                {catData.contextHealth.modeDistribution.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Work Modes</p>
                    <RatioBar items={catData.contextHealth.modeDistribution.map((m, i) => ({
                      label: `${m.mode} (${m.pct}%)`,
                      value: m.count,
                      color: COLORS[i % COLORS.length],
                    }))} />
                  </div>
                )}
                {catData.contextHealth.skillList.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Active Skills</p>
                    <div className="flex flex-wrap gap-1">
                      {catData.contextHealth.skillList.map(s => (
                        <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {catData.contextHealth.totalBlockers > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <Mini label="Blockers" value={catData.contextHealth.totalBlockers} color="text-amber-500" />
                    <Mini label="Resolved" value={`${catData.contextHealth.blockerResolutionRate}%`} color={catData.contextHealth.blockerResolutionRate > 70 ? "text-emerald-500" : "text-red-500"} />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      </div>
    </div>
  );
}
