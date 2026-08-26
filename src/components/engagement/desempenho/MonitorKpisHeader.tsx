import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowDown, ArrowUp, CheckCircle2, EyeOff, Megaphone, Minus, MousePointerClick, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtPct, type PubKpis } from "@/lib/engagement-desempenho";

function Kpi({
  label, value, hint, icon: Icon, delta, accent = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: typeof Users;
  delta?: number | null;
  accent?: "default" | "success" | "warning" | "danger";
}) {
  const accentMap = {
    default: "bg-primary/10 text-primary",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    danger: "bg-destructive/10 text-destructive",
  } as const;
  const DeltaIcon = delta == null ? null : delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
            {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
          </div>
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", accentMap[accent])}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        {DeltaIcon && (
          <div className="mt-2 flex items-center gap-1 text-[11px]">
            <DeltaIcon
              className={cn(
                "h-3 w-3",
                (delta ?? 0) > 0 && "text-emerald-500",
                (delta ?? 0) < 0 && "text-destructive",
                (delta ?? 0) === 0 && "text-muted-foreground",
              )}
            />
            <span
              className={cn(
                "font-medium tabular-nums",
                (delta ?? 0) > 0 && "text-emerald-600 dark:text-emerald-400",
                (delta ?? 0) < 0 && "text-destructive",
                (delta ?? 0) === 0 && "text-muted-foreground",
              )}
            >
              {(delta ?? 0) > 0 ? "+" : ""}
              {Number(delta ?? 0).toFixed(1).replace(".0", "")} pts
            </span>
            <span className="text-muted-foreground">vs. período anterior</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function MonitorKpisHeader({ kpis }: { kpis: PubKpis | null }) {
  const k = kpis;
  const deltaAdesao = k ? Number(k.adesao) - Number(k.adesao_ant) : null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <Kpi
        label="Publicações"
        value={k?.publicacoes ?? 0}
        hint={`${k?.publicacoes_ant ?? 0} no período anterior`}
        icon={Megaphone}
      />
      <Kpi label="Pessoas obrigadas" value={k?.obrigados ?? 0} hint={`${k?.pares ?? 0} cobranças geradas`} icon={Users} />
      <Kpi
        label="Cumprimentos"
        value={k?.cumprimentos ?? 0}
        hint={`${k?.cumprimentos_ant ?? 0} no período anterior`}
        icon={CheckCircle2}
        accent="success"
      />
      <Kpi
        label="Adesão média"
        value={fmtPct(k?.adesao)}
        hint={`Anterior: ${fmtPct(k?.adesao_ant)}`}
        icon={CheckCircle2}
        accent="success"
        delta={deltaAdesao}
      />
      <Kpi
        label="Abriu e não confirmou"
        value={k?.abriu_sem_confirmar ?? 0}
        hint="Oportunidade de cobrança"
        icon={MousePointerClick}
        accent="warning"
      />
      <Kpi
        label="Nunca engajaram"
        value={k?.nunca_engajaram ?? 0}
        hint="Nenhuma abertura no período"
        icon={EyeOff}
        accent="danger"
      />
    </div>
  );
}
