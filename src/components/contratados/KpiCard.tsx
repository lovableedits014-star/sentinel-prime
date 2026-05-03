import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  trend?: { value: number; label?: string }; // % change
  accent?: "default" | "success" | "warning" | "danger";
}

const accentMap: Record<NonNullable<Props["accent"]>, string> = {
  default: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "bg-destructive/10 text-destructive",
};

export default function KpiCard({ label, value, hint, icon: Icon, trend, accent = "default" }: Props) {
  const TrendIcon = trend ? (trend.value > 0 ? TrendingUp : trend.value < 0 ? TrendingDown : Minus) : null;
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold tabular-nums">{value}</p>
            {hint && <p className="text-xs text-muted-foreground truncate">{hint}</p>}
          </div>
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", accentMap[accent])}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
        {trend && TrendIcon && (
          <div className="mt-3 flex items-center gap-1.5 text-xs">
            <TrendIcon className={cn(
              "w-3.5 h-3.5",
              trend.value > 0 && "text-emerald-500",
              trend.value < 0 && "text-destructive",
              trend.value === 0 && "text-muted-foreground"
            )} />
            <span className={cn(
              "font-medium tabular-nums",
              trend.value > 0 && "text-emerald-600 dark:text-emerald-400",
              trend.value < 0 && "text-destructive",
              trend.value === 0 && "text-muted-foreground"
            )}>
              {trend.value > 0 ? "+" : ""}{trend.value}%
            </span>
            {trend.label && <span className="text-muted-foreground">{trend.label}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
