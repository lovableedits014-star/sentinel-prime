import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { useActiveClientId } from "@/hooks/useActiveClientId";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BarChart3, Eye, Users, MousePointerClick, CheckCircle2, Archive, Loader2, Search } from "lucide-react";
import MissionReport from "./MissionReport";

type Row = {
  mission_id: string;
  title: string | null;
  archived_at: string | null;
  tracking_enabled: boolean;
  created_at: string;
  total_opens: number;
  unique_participants: number;
  click_facebook: number;
  click_instagram: number;
  click_avulso: number;
  declared_done: number;
  last_event_at: string | null;
};

export default function MissionsDashboard() {
  const clientId = useActiveClientId();
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [reportMissionId, setReportMissionId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ["client-missions-dashboard", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("client_missions_dashboard", {
        p_client_id: clientId,
      });
      if (error) throw error;
      return (data || []) as Row[];
    },
    enabled: !!clientId,
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showArchived && r.archived_at) return false;
      if (q && !(r.title || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, showArchived, search]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.opens += r.total_opens;
        acc.participants += r.unique_participants;
        acc.clicks += r.click_facebook + r.click_instagram + r.click_avulso;
        acc.done += r.declared_done;
        return acc;
      },
      { opens: 0, participants: 0, clicks: 0, done: 0 },
    );
  }, [filtered]);

  if (!clientId) {
    return <div className="p-6 text-sm text-muted-foreground">Selecione um cliente para ver os relatórios.</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Relatórios de Missões</h2>
          <p className="text-sm text-muted-foreground">
            Acompanhe acessos, cliques e participantes de todas as missões — inclusive as arquivadas.
          </p>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <TotalCard icon={<Eye className="w-4 h-4" />} label="Acessos" value={totals.opens} />
        <TotalCard icon={<Users className="w-4 h-4" />} label="Pessoas únicas" value={totals.participants} />
        <TotalCard icon={<MousePointerClick className="w-4 h-4" />} label="Cliques em links" value={totals.clicks} />
        <TotalCard icon={<CheckCircle2 className="w-4 h-4" />} label="Marcadas concluídas" value={totals.done} />
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-2 md:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por título da missão..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant={showArchived ? "default" : "outline"}
          size="sm"
          onClick={() => setShowArchived((v) => !v)}
          className="gap-1.5"
        >
          <Archive className="w-4 h-4" />
          {showArchived ? "Exibindo arquivadas" : "Incluir arquivadas"}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma missão encontrada.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((r) => (
            <Card key={r.mission_id} className={r.archived_at ? "opacity-70" : ""}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start gap-2 justify-between">
                  <CardTitle className="text-base leading-tight">
                    {r.title || "(sem título)"}
                  </CardTitle>
                  <div className="flex gap-1.5 flex-wrap">
                    {r.archived_at && (
                      <Badge variant="secondary" className="gap-1">
                        <Archive className="w-3 h-3" /> Arquivada
                      </Badge>
                    )}
                    {r.tracking_enabled ? (
                      <Badge variant="default">Rastreamento ativo</Badge>
                    ) : (
                      <Badge variant="outline">Sem rastreamento</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm">
                  <Metric label="Acessos" value={r.total_opens} />
                  <Metric label="Únicos" value={r.unique_participants} />
                  <Metric label="Facebook" value={r.click_facebook} />
                  <Metric label="Instagram" value={r.click_instagram} />
                  <Metric label="Avulso" value={r.click_avulso} />
                  <Metric label="Concluídas" value={r.declared_done} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {r.last_event_at
                      ? `Último evento: ${new Date(r.last_event_at).toLocaleString("pt-BR")}`
                      : "Sem eventos registrados"}
                  </p>
                  <Button size="sm" variant="outline" onClick={() => setReportMissionId(r.mission_id)}>
                    Detalhes
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {reportMissionId && (
        <MissionReport missionId={reportMissionId} onClose={() => setReportMissionId(null)} />
      )}
    </div>
  );
}

function TotalCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-semibold">{value.toLocaleString("pt-BR")}</div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value.toLocaleString("pt-BR")}</div>
    </div>
  );
}
