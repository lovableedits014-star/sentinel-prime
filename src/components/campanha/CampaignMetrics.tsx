import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Clock, Users, TrendingUp, AlertTriangle } from "lucide-react";
import { isPast } from "date-fns";

type Tarefa = {
  id: string;
  responsavel_id: string | null;
  prazo: string | null;
  status: string;
  prioridade: string;
};

interface CampaignMetricsProps {
  tarefas: Tarefa[];
  teamMembers: { id: string; name: string }[];
}

const CampaignMetrics = ({ tarefas, teamMembers }: CampaignMetricsProps) => {
  const total = tarefas.length;
  const concluidas = tarefas.filter(t => t.status === "concluida").length;
  const emProgresso = tarefas.filter(t => t.status === "em_progresso").length;
  const atrasadas = tarefas.filter(t => t.prazo && isPast(new Date(t.prazo + "T23:59:59")) && t.status !== "concluida").length;
  const taxaConclusao = total > 0 ? Math.round((concluidas / total) * 100) : 0;

  // Tasks per member
  const memberStats = teamMembers.map(m => {
    const memberTasks = tarefas.filter(t => t.responsavel_id === m.id);
    const memberDone = memberTasks.filter(t => t.status === "concluida").length;
    return { name: m.name, total: memberTasks.length, done: memberDone };
  }).filter(m => m.total > 0).sort((a, b) => b.total - a.total);

  const unassigned = tarefas.filter(t => !t.responsavel_id).length;

  const metrics = [
    { label: "Concluídas", value: concluidas, total, icon: CheckCircle2, color: "text-emerald-400" },
    { label: "Em Progresso", value: emProgresso, total: null, icon: Clock, color: "text-amber-400" },
    { label: "Atrasadas", value: atrasadas, total: null, icon: AlertTriangle, color: atrasadas > 0 ? "text-destructive" : "text-muted-foreground" },
    { label: "Taxa Conclusão", value: `${taxaConclusao}%`, total: null, icon: TrendingUp, color: "text-primary" },
  ];

  return (
    <div className="space-y-4">
      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metrics.map(m => {
          const Icon = m.icon;
          return (
            <Card key={m.label}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-muted/50 ${m.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground leading-none">
                    {m.value}{m.total !== null ? <span className="text-xs text-muted-foreground font-normal">/{m.total}</span> : ""}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase mt-0.5">{m.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Member breakdown */}
      {(memberStats.length > 0 || unassigned > 0) && (
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
              <Users className="w-3 h-3" /> Distribuição por Responsável
            </p>
            <div className="space-y-2">
              {memberStats.map(m => (
                <div key={m.name} className="flex items-center gap-2">
                  <span className="text-xs text-foreground font-medium w-28 truncate">{m.name}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${m.total > 0 ? (m.done / m.total) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground w-10 text-right">{m.done}/{m.total}</span>
                </div>
              ))}
              {unassigned > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {unassigned} tarefa(s) sem responsável
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CampaignMetrics;
