import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, CalendarDays, FileDown, Gauge, Grid3x3, Megaphone, RefreshCw, TrendingUp } from "lucide-react";
import { fetchAudiences } from "@/lib/mission-audiences";
import {
  fetchEquipeDesempenhoPeriodo, fetchPubKpisPeriodo, fetchPublicacoesAuditPeriodo,
  fetchPublicacoesDesempenhoPeriodo, fetchTeamRoots,
} from "@/lib/engagement-desempenho";
import MonitorKpisHeader from "./MonitorKpisHeader";
import MonitorCharts from "./MonitorCharts";
import PublicacoesDesempenhoPanel from "./PublicacoesDesempenhoPanel";
import EquipeRankingPanel from "./EquipeRankingPanel";
import MatrizCumprimentoPanel from "./MatrizCumprimentoPanel";
import ResumoEquipesPeriodoPanel, { type TeamPeriodSummary } from "./ResumoEquipesPeriodoPanel";

const localIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const daysAgoIso = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localIsoDate(date);
};

const dateLabel = (iso: string) => iso ? iso.split("-").reverse().join("-") : "—";

export default function DesempenhoPublicacoesPanel({ clientId }: { clientId: string }) {
  const today = localIsoDate(new Date());
  const [dataFim, setDataFim] = useState(today);
  const [dataInicio, setDataInicio] = useState(() => daysAgoIso(6));
  const [audienceId, setAudienceId] = useState<string>("padrao");
  const [rootId, setRootId] = useState<string>("todos");
  const [missionId, setMissionId] = useState<string>("todas");
  const aud = audienceId === "padrao" ? null : audienceId;
  const filters = {
    rootId: rootId === "todos" ? null : rootId,
    missionId: missionId === "todas" ? null : missionId,
  };
  const period = { inicio: dataInicio, fim: dataFim };
  const periodValid = !!dataInicio && !!dataFim && dataInicio <= dataFim && dataFim <= today;
  const periodoLabel = `${dateLabel(dataInicio)} a ${dateLabel(dataFim)}`;

  const applyLastDays = (days: number) => {
    setDataFim(today);
    setDataInicio(daysAgoIso(days - 1));
    setMissionId("todas");
  };

  const audiences = useQuery({
    queryKey: ["mission-audiences", clientId],
    queryFn: () => fetchAudiences(clientId),
    enabled: !!clientId,
  });

  const teamRoots = useQuery({
    queryKey: ["eng-team-roots", clientId],
    queryFn: () => fetchTeamRoots(clientId),
    enabled: !!clientId,
  });

  const missionOptions = useQuery({
    queryKey: ["eng-pub-mission-options", clientId, dataInicio, dataFim, aud],
    queryFn: () => fetchPublicacoesDesempenhoPeriodo(clientId, period, aud),
    enabled: !!clientId && periodValid,
  });

  const kpis = useQuery({
    queryKey: ["eng-pub-kpis", clientId, dataInicio, dataFim, aud, rootId, missionId],
    queryFn: () => fetchPubKpisPeriodo(clientId, period, aud, filters),
    enabled: !!clientId && periodValid,
  });

  const publicacoes = useQuery({
    queryKey: ["eng-pub-desempenho", clientId, dataInicio, dataFim, aud, rootId, missionId],
    queryFn: () => fetchPublicacoesDesempenhoPeriodo(clientId, period, aud, filters),
    enabled: !!clientId && periodValid,
  });

  const audit = useQuery({
    queryKey: ["eng-pub-audit", clientId, dataInicio, dataFim, aud, rootId, missionId],
    queryFn: () => fetchPublicacoesAuditPeriodo(clientId, period, aud, filters),
    enabled: !!clientId && periodValid,
  });

  const equipe = useQuery({
    queryKey: ["eng-equipe-desempenho", clientId, dataInicio, dataFim, aud, rootId, missionId],
    queryFn: () => fetchEquipeDesempenhoPeriodo(clientId, period, aud, filters),
    enabled: !!clientId && periodValid,
  });

  const resumoEquipes = useQuery({
    queryKey: ["eng-resumo-equipes-periodo", clientId, dataInicio, dataFim, aud, missionId, teamRoots.data],
    queryFn: async () => Promise.all((teamRoots.data ?? []).map(async (root): Promise<TeamPeriodSummary> => {
      const equipeDaRaiz = await fetchEquipeDesempenhoPeriodo(clientId, period, aud, {
        rootId: root.root_id,
        missionId: filters.missionId,
      });
      // Líder avulso é mensurado individualmente; coordenador consolida a equipe inteira.
      const membros = root.is_avulso
        ? equipeDaRaiz.filter((person) => person.pessoa_id === root.root_id)
        : equipeDaRaiz;
      const atribuicoes = membros.reduce((sum, person) => sum + person.publicacoes, 0);
      const cumpridas = membros.reduce((sum, person) => sum + person.cumpridas, 0);
      const abriu = membros.reduce((sum, person) => sum + person.abriu_sem_confirmar, 0);
      const faltas = membros.reduce((sum, person) => sum + person.faltas, 0);
      return { ...root, membros, atribuicoes, cumpridas, abriu, faltas, adesao: atribuicoes ? cumpridas / atribuicoes * 100 : 0 };
    })),
    enabled: !!clientId && periodValid && teamRoots.isSuccess,
  });

  const carregando = kpis.isLoading || publicacoes.isLoading || equipe.isLoading || audit.isLoading;
  const erro = kpis.error || publicacoes.error || equipe.error || audit.error;

  const recarregar = () => {
    kpis.refetch();
    publicacoes.refetch();
    equipe.refetch();
    audit.refetch();
    resumoEquipes.refetch();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="px-3 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4 text-primary" /> Desempenho da equipe nas publicações
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Conta <strong>todas</strong> as publicações do período e reúne as provas de cumprimento em um só lugar:
            <strong> E1</strong> comprovado e validado, <strong>E2</strong> confirmado no portal ou
            check-in, <strong>E3</strong> evidência anexada. Quem abriu o link e não confirmou aparece separado de quem
            nunca abriu.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3 px-3 sm:px-6">
          <div className="space-y-1">
            <Label className="text-xs">Atalho de período</Label>
            <Select value="personalizado" onValueChange={(v) => v !== "personalizado" && applyLastDays(Number(v))}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="personalizado">Personalizado</SelectItem>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
                <SelectItem value="180">180 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Lista de obrigados</Label>
            <Select value={audienceId} onValueChange={(v) => { setAudienceId(v); setMissionId("todas"); }}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="padrao">Padrão (estrutura + contratos)</SelectItem>
                {(audiences.data ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data inicial</Label>
            <Input
              type="date" value={dataInicio} max={dataFim || today} className="w-[160px]"
              onChange={(e) => { setDataInicio(e.target.value); setMissionId("todas"); }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data final</Label>
            <Input
              type="date" value={dataFim} min={dataInicio} max={today} className="w-[160px]"
              onChange={(e) => { setDataFim(e.target.value); setMissionId("todas"); }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Equipe responsável</Label>
            <Select value={rootId} onValueChange={setRootId}>
              <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as equipes</SelectItem>
                {(teamRoots.data ?? []).map((r) => (
                  <SelectItem key={r.root_id} value={r.root_id}>
                    {r.is_avulso ? "Líder avulso" : "Coordenador"} · {r.nome} ({r.pessoas})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Missão</Label>
            <Select value={missionId} onValueChange={setMissionId}>
              <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as missões do período</SelectItem>
                {(missionOptions.data ?? []).map((m) => (
                  <SelectItem key={m.mission_id} value={m.mission_id}>
                    {m.titulo || "Missão sem título"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={recarregar} disabled={carregando} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <div className="flex h-9 items-center gap-1.5 rounded-md bg-muted px-3 text-xs font-medium">
            <CalendarDays className="h-3.5 w-3.5" /> {periodoLabel}
          </div>
        </CardContent>
      </Card>

      {!periodValid && <p className="text-sm text-destructive">Escolha um período válido, sem datas futuras.</p>}

      {erro && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            Erro ao carregar o desempenho: {(erro as Error).message}
          </CardContent>
        </Card>
      )}

      {carregando ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <MonitorKpisHeader kpis={kpis.data ?? null} />
          <MonitorCharts
            kpis={kpis.data ?? null}
            publicacoes={publicacoes.data ?? []}
            pessoas={equipe.data ?? []}
          />

          <Tabs defaultValue="publicacoes" className="space-y-4">
            <TabsList>
              <TabsTrigger value="publicacoes" className="gap-1.5 text-xs sm:text-sm">
                <Megaphone className="h-4 w-4" /> Publicações
              </TabsTrigger>
              <TabsTrigger value="equipe" className="gap-1.5 text-xs sm:text-sm">
                <TrendingUp className="h-4 w-4" /> Ranking da equipe
              </TabsTrigger>
              <TabsTrigger value="matriz" className="gap-1.5 text-xs sm:text-sm">
                <Grid3x3 className="h-4 w-4" /> Matriz
              </TabsTrigger>
              <TabsTrigger value="relatorios" className="gap-1.5 text-xs sm:text-sm">
                <FileDown className="h-4 w-4" /> Relatórios gerais
              </TabsTrigger>
            </TabsList>

            <TabsContent value="publicacoes">
              <PublicacoesDesempenhoPanel
                clientId={clientId}
                audienceId={aud}
                rows={publicacoes.data ?? []}
                periodoLabel={periodoLabel}
                audit={audit.data ?? []}
              />
            </TabsContent>

            <TabsContent value="equipe">
              <EquipeRankingPanel rows={equipe.data ?? []} periodoLabel={periodoLabel} />
            </TabsContent>

            <TabsContent value="matriz">
              <MatrizCumprimentoPanel
                pessoas={equipe.data ?? []}
                publicacoes={publicacoes.data ?? []}
                periodoLabel={periodoLabel}
              />
            </TabsContent>

            <TabsContent value="relatorios">
              <ResumoEquipesPeriodoPanel
                rows={resumoEquipes.data ?? []}
                periodoLabel={periodoLabel}
                loading={resumoEquipes.isLoading || resumoEquipes.isFetching}
              />
            </TabsContent>
          </Tabs>

          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <BarChart3 className="h-3.5 w-3.5" /> Base: publicações não arquivadas do período, confirmações do portal,
            check-ins, cliques rastreados nas redes e obrigações/evidências.
          </p>
        </>
      )}
    </div>
  );
}
