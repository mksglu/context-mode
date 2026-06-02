import { memo } from "react";
import type { Insight } from "@/lib/insights";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Zap } from "lucide-react";

const SEV_STYLES = {
  positive: { border: "border-emerald-500/30", bg: "bg-emerald-500/5", badge: "bg-emerald-500/15 text-emerald-400", label: "Nice" },
  warning: { border: "border-amber-500/30", bg: "bg-amber-500/5", badge: "bg-amber-500/15 text-amber-400", label: "Heads up" },
  critical: { border: "border-red-500/30", bg: "bg-red-500/5", badge: "bg-red-500/15 text-red-400", label: "Fix this" },
  neutral: { border: "border-blue-500/30", bg: "bg-blue-500/5", badge: "bg-blue-500/15 text-blue-400", label: "FYI" },
};

export const InsightCard = memo(function InsightCard({ icon, severity, metric, evidence, action, roi }: Insight) {
  const s = SEV_STYLES[severity];
  return (
    <Card className={`${s.border} ${s.bg}`}>
      <CardContent className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${s.badge}`}>
          {s.label}
        </span>
      </div>
      <div className="flex items-center gap-2.5 mb-2">
        <div className="shrink-0">{icon}</div>
        <h4 className="text-base font-bold leading-tight">{metric}</h4>
      </div>
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">{evidence}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-background/40 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">What to do</p>
          <p className="text-xs leading-relaxed">{action}</p>
        </div>
        <div className="rounded-lg bg-background/40 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Why it matters</p>
          <p className="text-xs leading-relaxed">{roi}</p>
        </div>
      </div>
      </CardContent>
    </Card>
  );
});

export const Stat = memo(function Stat({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub: string; icon: typeof Zap; color: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
});

export const RatioBar = memo(function RatioBar({ items }: { items: { label: string; value: number; color: string }[] }) {
  const total = items.reduce((a, b) => a + b.value, 0);
  if (total === 0) return null;
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-secondary">
        {items.map((item, i) => (
          <div key={i} className="transition-all" style={{
            width: `${Math.max(Math.round(100 * item.value / total), 2)}%`,
            background: item.color,
          }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {items.map((item, i) => (
          <span key={i} className="text-[10px] text-muted-foreground flex items-center gap-1">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
            {item.label}: {item.value} ({Math.round(100 * item.value / total)}%)
          </span>
        ))}
      </div>
    </div>
  );
});

export const Mini = memo(function Mini({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold tabular-nums ${color || ""}`}>{value}</div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
});
