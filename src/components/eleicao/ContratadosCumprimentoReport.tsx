import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { endOfDay, format, startOfMonth } from "date-fns";
import {
  AlertCircle,
  Award,
  ChevronDown,
  Crown,
  FileDown,
  Loader2,
  Network,
  Search,
  Target,
  Trophy,
  UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  exportElectionContractReportPdf,
  exportElectionRankingPdf,
} from "@/lib/election-contract-report-pdf";
import { buildElectionRanking, type ElectionRankingRow } from "@/lib/election-ranking";

type MissionDetail = {
  mission_id: string;
  titulo: string;
  publicado_em: string;
  status: "cumpriu" | "abriu" | "nao_abriu";
  primeiro_acesso_em?: string;
  cumprido_em?: string;
};
type IndicationDetail = {
  id: string;
  nome: string;
  telefone: string;
  cidade?: string;
  bairro?: string;
  origem: string;
  status_telemarketing: string;
  vota_candidato?: string | null;
  candidato_alternativo?: string | null;
  created_at: string;
};
type ReportRow = {
  pessoa_id: string;
  nome: string;
  telefone: string;
  cargo: string;
  escopo: string;
  regiao: string | null;
  cidade: string | null;
  parent_id: string | null;
  responsavel_nome: string | null;
  coordenador_id: string | null;
  coordenador_nome: string | null;
  coordenador_telefone: string | null;
  valor_contratacao: number;
  contratado_em: string;
  missoes: number;
  cumpridas: number;
  abriu_sem_concluir: number;
  nao_abriu: number;
  taxa: number;
  faixa: string;
  ultima_atividade: string | null;
  total_indicados: number;
  meta_indicados: number;
  situacao_lista: string;
  ultima_indicacao_em: string | null;
  missoes_detalhe: MissionDetail[];
  indicados_detalhe: IndicationDetail[];
  votos_confirmados: number;
  devolutivas_negativas: number;
};

type RpcResult = { data: unknown; error: { message: string } | null };
type VoteAudit = {
  votos_confirmados: number;
  devolutivas_negativas: number;
  respostas_validas: number;
  telefones_duplicados: number;
  confirmados_vinculados_eleicao: number;
  negativas_vinculadas_eleicao: number;
  por_origem: Record<string, { confirmados: number; negativas: number; total: number }>;
  atualizado_em: string;
};
const reportDb = supabase as unknown as {
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
};

const statusLabel: Record<string, string> = {
  cumprindo: "Cumprindo",
  atencao: "Em atenção",
  baixo: "Baixo cumprimento",
  nao_cumprindo: "Não está cumprindo",
  sem_avaliacao: "Sem avaliação",
};
const listLabel: Record<string, string> = {
  nao_iniciou: "Não iniciou",
  parcial: "Lista parcial",
  completa: "Lista completa",
  acima_meta: "Acima da meta",
};
const badgeClass = (s: string) =>
  s === "cumprindo"
    ? "text-emerald-700 border-emerald-300"
    : s === "atencao"
      ? "text-sky-700 border-sky-300"
      : s === "baixo"
        ? "text-amber-700 border-amber-300"
        : s === "nao_cumprindo"
          ? "text-destructive border-destructive/40"
          : "text-muted-foreground";
const area = (r: ReportRow) =>
  r.escopo === "interior" ? r.cidade || "Sem cidade" : r.regiao || "Sem região";
const n = (v: unknown) => Number(v || 0);

export default function ContratadosCumprimentoReport({ clientId }: { clientId: string }) {
  const today = format(endOfDay(new Date()), "yyyy-MM-dd");
  const [inicio, setInicio] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [fim, setFim] = useState(today);
  const [search, setSearch] = useState("");
  const [coordinator, setCoordinator] = useState("all");
  const [region, setRegion] = useState("all");
  const [status, setStatus] = useState("all");
  const [exporting, setExporting] = useState(false);
  const [exportingRanking, setExportingRanking] = useState(false);

  const query = useQuery({
    queryKey: ["election-contract-compliance", clientId, inicio, fim],
    enabled: !!clientId && !!inicio && !!fim && fim >= inicio,
    refetchOnMount: "always",
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
    queryFn: async () => {
      const [{ data, error }, configResult, auditResult] = await Promise.all([
        reportDb.rpc("election_contract_compliance_report", {
          p_client_id: clientId,
          p_data_inicio: inicio,
          p_data_fim: fim,
        }),
        supabase
          .from("eleicao_indicacao_config")
          .select("meta_coordenador,meta_lider,meta_cabo")
          .eq("client_id", clientId)
          .maybeSingle(),
        reportDb.rpc("telemarketing_vote_return_audit", { p_client_id: clientId }),
      ]);
      if (error) throw error;
      if (configResult.error) throw configResult.error;
      if (auditResult.error) throw auditResult.error;
      const config = configResult.data;
      const people = ((data || []) as ReportRow[]).map((r) => {
        const details = Array.isArray(r.indicados_detalhe) ? r.indicados_detalhe : [];
        const currentMeta =
          r.cargo === "coordenador"
            ? Number(config?.meta_coordenador ?? 30)
            : r.cargo === "lider"
              ? Number(config?.meta_lider ?? 30)
              : Number(config?.meta_cabo ?? 5);
        const listStatus =
          n(r.total_indicados) === 0
            ? "nao_iniciou"
            : n(r.total_indicados) < currentMeta
              ? "parcial"
              : n(r.total_indicados) === currentMeta
                ? "completa"
                : "acima_meta";
        return {
          ...r,
          meta_indicados: currentMeta,
          situacao_lista: listStatus,
          missoes_detalhe: Array.isArray(r.missoes_detalhe) ? r.missoes_detalhe : [],
          indicados_detalhe: details,
          votos_confirmados: details.filter((i) => i.vota_candidato === "sim").length,
          devolutivas_negativas: details.filter((i) => i.vota_candidato === "nao").length,
        };
      });
      const voteAudit = (auditResult.data as VoteAudit[] | null)?.[0] || null;
      return { people, voteAudit };
    },
  });
  const refetchReport = query.refetch;
  useEffect(() => {
    const refresh = () => refetchReport();
    window.addEventListener("eleicao:indicacao-config-changed", refresh);
    return () => window.removeEventListener("eleicao:indicacao-config-changed", refresh);
  }, [refetchReport]);
  const rows = useMemo(() => query.data?.people || [], [query.data]);
  const voteAudit = query.data?.voteAudit;
  const coordinators = useMemo(
    () =>
      Array.from(
        new Map(
          rows
            .filter((r) => r.coordenador_id)
            .map((r) => [r.coordenador_id!, r.coordenador_nome || "Sem nome"]),
        ),
      ).sort((a, b) => a[1].localeCompare(b[1])),
    [rows],
  );
  const regions = useMemo(() => Array.from(new Set(rows.map(area))).sort(), [rows]);
  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const q = search.trim().toLocaleLowerCase("pt-BR");
        return (
          (coordinator === "all" ||
            (coordinator === "standalone"
              ? !r.coordenador_id
              : r.coordenador_id === coordinator)) &&
          (region === "all" || area(r) === region) &&
          (status === "all" || r.faixa === status) &&
          (!q ||
            [r.nome, r.telefone, r.coordenador_nome, r.responsavel_nome, area(r)].some((v) =>
              (v || "").toLocaleLowerCase("pt-BR").includes(q),
            ))
        );
      }),
    [rows, search, coordinator, region, status],
  );
  const totals = useMemo(
    () => ({
      people: filtered.length,
      missions: filtered.reduce((s, r) => s + n(r.missoes), 0),
      done: filtered.reduce((s, r) => s + n(r.cumpridas), 0),
      opened: filtered.reduce((s, r) => s + n(r.abriu_sem_concluir), 0),
      missed: filtered.reduce((s, r) => s + n(r.nao_abriu), 0),
      indicated: filtered.reduce((s, r) => s + n(r.total_indicados), 0),
      sent: filtered.filter((r) => n(r.total_indicados) > 0).length,
      confirmedLinked: filtered.reduce((s, r) => s + r.votos_confirmados, 0),
      negativeLinked: filtered.reduce((s, r) => s + r.devolutivas_negativas, 0),
    }),
    [filtered],
  );
  const adherence = totals.missions ? (100 * totals.done) / totals.missions : 0;
  const byRegion = useMemo(() => groupRows(filtered, area), [filtered]);
  const ranking = useMemo(() => buildElectionRanking(filtered), [filtered]);

  const exportPdf = async () => {
    setExporting(true);
    try {
      await exportElectionContractReportPdf({ inicio, fim, rows: filtered });
      toast.success("PDF gerado com as equipes agrupadas.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o PDF.");
    } finally {
      setExporting(false);
    }
  };

  const exportRankingPdf = async () => {
    setExportingRanking(true);
    try {
      await exportElectionRankingPdf({ inicio, fim, rows: ranking });
      toast.success("Ranking executivo exportado em PDF.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o ranking.");
    } finally {
      setExportingRanking(false);
    }
  };

  if (query.isLoading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  if (query.isError)
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex gap-2 pt-6 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <div>
            <p className="font-medium">Não foi possível carregar o relatório.</p>
            <p className="text-sm">{(query.error as Error).message}</p>
          </div>
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Relatório de cumprimento dos contratados</CardTitle>
              <CardDescription>
                Missões e listas de indicados consolidadas pela estrutura da Eleição.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-emerald-700">
                Telemarketing atualizado automaticamente a cada 30s
              </Badge>
              <Button
                variant="outline"
                onClick={exportPdf}
                disabled={!filtered.length || exporting}
              >
                {exporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="mr-2 h-4 w-4" />
                )}
                Exportar PDF por equipe
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
          <div className="space-y-1">
            <Label htmlFor="report-date-start" className="text-xs">
              Missões de
            </Label>
            <Input
              id="report-date-start"
              type="date"
              value={inicio}
              max={fim}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="report-date-end" className="text-xs">
              Missões até
            </Label>
            <Input
              id="report-date-end"
              type="date"
              value={fim}
              min={inicio}
              max={today}
              onChange={(e) => setFim(e.target.value)}
            />
          </div>
          <Select value={coordinator} onValueChange={setCoordinator}>
            <SelectTrigger>
              <SelectValue placeholder="Coordenador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os coordenadores</SelectItem>
              <SelectItem value="standalone">Sem coordenador</SelectItem>
              {coordinators.map(([id, name]) => (
                <SelectItem value={id} key={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger>
              <SelectValue placeholder="Região" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as regiões</SelectItem>
              {regions.map((v) => (
                <SelectItem value={v} key={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Cumprimento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os resultados</SelectItem>
              {Object.entries(statusLabel).map(([v, l]) => (
                <SelectItem value={v} key={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome ou telefone"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <Metric
          label="Contratados"
          value={totals.people}
          help={`${filtered.filter((r) => !r.coordenador_id).length} sem coordenador`}
        />
        <Metric
          label="Cumprimento"
          value={`${adherence.toFixed(1)}%`}
          help={`${totals.done}/${totals.missions} obrigações`}
        />
        <Metric label="Cumpriram" value={totals.done} help="missões concluídas" good />
        <Metric label="Abriram" value={totals.opened} help="sem concluir" />
        <Metric label="Não abriram" value={totals.missed} help="missões pendentes" danger />
        <Metric
          label="Indicados"
          value={totals.indicated}
          help={`${totals.sent}/${totals.people} enviaram lista`}
        />
        <Metric
          label="Votos confirmados"
          value={n(voteAudit?.votos_confirmados)}
          help={`${totals.confirmedLinked} atribuídos às equipes filtradas · base inteira sem duplicar telefone`}
          good
        />
        <Metric
          label="Devolutivas negativas"
          value={n(voteAudit?.devolutivas_negativas)}
          help={`${totals.negativeLinked} atribuídas às equipes filtradas · base inteira sem duplicar telefone`}
          danger
        />
      </div>

      {voteAudit && (
        <Card className="border-slate-200 bg-slate-50/50 dark:bg-slate-950/20">
          <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3 text-xs">
            <strong>Auditoria das devolutivas:</strong>
            {Object.entries(voteAudit.por_origem || {}).map(([origin, values]) => (
              <span key={origin}>
                {origin.replaceAll("_", " ")}:{" "}
                <b className="text-emerald-700">{values.confirmados} sim</b> ·{" "}
                <b className="text-destructive">{values.negativas} não</b>
              </span>
            ))}
            <span className="text-muted-foreground">
              {voteAudit.telefones_duplicados} registros duplicados removidos
            </span>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="ranking">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="ranking" className="gap-1.5">
            <Trophy className="h-3.5 w-3.5" />
            Ranking ({ranking.length})
          </TabsTrigger>
          <TabsTrigger value="teams" className="gap-1.5">
            <Network className="h-3.5 w-3.5" />
            Equipes em árvore
          </TabsTrigger>
          <TabsTrigger value="people">Lista geral ({filtered.length})</TabsTrigger>
          <TabsTrigger value="regions">Por região</TabsTrigger>
        </TabsList>
        <TabsContent value="ranking">
          <RankingPanel rows={ranking} exporting={exportingRanking} onExport={exportRankingPdf} />
        </TabsContent>
        <TabsContent value="teams">
          <TeamForest rows={filtered} />
        </TabsContent>
        <TabsContent value="people">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contratado</TableHead>
                      <TableHead>Coordenação</TableHead>
                      <TableHead>Região</TableHead>
                      <TableHead>Missões</TableHead>
                      <TableHead>Resultado</TableHead>
                      <TableHead>Indicados</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <PersonRow key={r.pessoa_id} row={r} />
                    ))}
                  </TableBody>
                </Table>
              </div>
              {!filtered.length && (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  Nenhum contratado encontrado nesses filtros.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="regions">
          <GroupTable rows={byRegion} label="Região / cidade" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const actionConfig: Record<
  ElectionRankingRow["action"],
  { label: string; className: string; note: string }
> = {
  elogiar: {
    label: "Elogiar",
    className: "border-emerald-300 bg-emerald-50 text-emerald-800",
    note: "Excelente ritmo",
  },
  acompanhar: {
    label: "Acompanhar",
    className: "border-sky-300 bg-sky-50 text-sky-800",
    note: "Bom desempenho",
  },
  cobrar: {
    label: "Cobrar",
    className: "border-amber-300 bg-amber-50 text-amber-900",
    note: "Precisa reagir",
  },
  urgente: {
    label: "Cobrança urgente",
    className: "border-red-300 bg-red-50 text-red-800",
    note: "Prioridade de gestão",
  },
};

function RankingPanel({
  rows,
  exporting,
  onExport,
}: {
  rows: ElectionRankingRow[];
  exporting: boolean;
  onExport: () => void;
}) {
  const podium = rows.slice(0, 3);
  const attention = rows.filter((row) => row.action === "cobrar" || row.action === "urgente");
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-indigo-200 bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-800 text-white">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-indigo-200">
              <Award className="h-4 w-4" /> Placar de desempenho
            </p>
            <h3 className="mt-1 text-2xl font-bold">Quem reconhecer e quem cobrar agora</h3>
            <p className="mt-1 max-w-2xl text-xs text-indigo-200">
              Nota: 50% missões cumpridas + 30% meta de indicados + 20% conversão das devolutivas.
              Os filtros acima também valem para este ranking.
            </p>
          </div>
          <Button
            className="shrink-0 bg-white text-indigo-950 hover:bg-indigo-50"
            onClick={onExport}
            disabled={!rows.length || exporting}
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="mr-2 h-4 w-4" />
            )}
            PDF executivo
          </Button>
        </CardContent>
      </Card>

      {podium.length > 0 && (
        <div className="grid gap-3 md:grid-cols-3">
          {podium.map((row, index) => (
            <Card
              key={row.id}
              className={
                index === 0
                  ? "border-amber-300 bg-gradient-to-b from-amber-50 to-background shadow-md"
                  : "bg-card"
              }
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full font-black ${index === 0 ? "bg-amber-400 text-amber-950" : index === 1 ? "bg-slate-200 text-slate-700" : "bg-orange-200 text-orange-900"}`}
                  >
                    {row.position}º
                  </div>
                  {index === 0 && <Crown className="h-6 w-6 text-amber-500" />}
                </div>
                <p className="mt-4 truncate text-lg font-bold">{row.name}</p>
                <p className="text-xs text-muted-foreground">
                  {row.area} · {row.people} pessoas
                </p>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <span className="text-4xl font-black tabular-nums">{row.score}</span>
                    <span className="text-sm text-muted-foreground">/100</span>
                  </div>
                  <Badge variant="outline" className={actionConfig[row.action].className}>
                    {actionConfig[row.action].label}
                  </Badge>
                </div>
                <Progress value={row.score} className="mt-3 h-2" />
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <MiniStat label="Missões" value={`${row.missionRate.toFixed(0)}%`} />
                  <MiniStat label="Listas" value={`${row.listRate.toFixed(0)}%`} />
                  <MiniStat label="Conversão" value={`${row.conversionRate.toFixed(0)}%`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Classificação completa</CardTitle>
            <CardDescription>Resumo objetivo por coordenação</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">#</TableHead>
                    <TableHead>Coordenação</TableHead>
                    <TableHead>Nota</TableHead>
                    <TableHead>Missões</TableHead>
                    <TableHead>Indicados</TableHead>
                    <TableHead>Votos</TableHead>
                    <TableHead>Orientação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={row.action === "urgente" ? "bg-red-50/60" : ""}
                    >
                      <TableCell className="text-lg font-black">{row.position}º</TableCell>
                      <TableCell>
                        <p className="font-semibold">{row.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.area} · {row.people} pessoas
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-24 items-center gap-2">
                          <strong className="tabular-nums">{row.score}</strong>
                          <Progress value={row.score} className="h-1.5 w-16" />
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.done}/{row.missions}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({row.missionRate.toFixed(0)}%)
                        </span>
                      </TableCell>
                      <TableCell>
                        {row.indicated}/{row.indicationGoal}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({row.listRate.toFixed(0)}%)
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold text-emerald-700">{row.confirmed} sim</span>{" "}
                        · <span className="text-destructive">{row.negative} não</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={actionConfig[row.action].className}>
                          {actionConfig[row.action].label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {!rows.length && (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Nenhuma coordenação encontrada nesses filtros.
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="h-fit border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-amber-600" /> Foco da cobrança
            </CardTitle>
            <CardDescription>{attention.length} equipe(s) abaixo de 60 pontos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {attention.slice(0, 6).map((row) => (
              <div key={row.id} className="rounded-lg border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{row.name}</p>
                  <strong className="text-sm tabular-nums">{row.score}</strong>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {actionConfig[row.action].note} · {row.missions - row.done} missão(ões)
                  pendente(s)
                </p>
              </div>
            ))}
            {!attention.length && (
              <p className="py-5 text-center text-sm text-emerald-700">
                Todas as equipes estão acima da faixa de cobrança.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/60 px-2 py-2">
      <p className="font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  help,
  good,
  danger,
}: {
  label: string;
  value: string | number;
  help: string;
  good?: boolean;
  danger?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`text-2xl font-bold ${good ? "text-emerald-600" : danger ? "text-destructive" : ""}`}
        >
          {value}
        </p>
        <p className="text-[11px] text-muted-foreground">{help}</p>
      </CardContent>
    </Card>
  );
}

function TeamForest({ rows }: { rows: ReportRow[] }) {
  const teams = useMemo(() => {
    const grouped = new Map<string, ReportRow[]>();
    for (const row of rows) {
      const key = row.coordenador_id || "standalone";
      const current = grouped.get(key) || [];
      current.push(row);
      grouped.set(key, current);
    }
    return Array.from(grouped.entries()).sort(([, a], [, b]) => {
      if (!a[0].coordenador_id) return 1;
      if (!b[0].coordenador_id) return -1;
      return (a[0].coordenador_nome || "").localeCompare(b[0].coordenador_nome || "");
    });
  }, [rows]);

  if (!teams.length)
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Nenhuma equipe encontrada nesses filtros.
        </CardContent>
      </Card>
    );
  return (
    <div className="space-y-3">
      {teams.map(([key, team]) => (
        <TeamCard key={key} team={team} standalone={key === "standalone"} />
      ))}
    </div>
  );
}

function TeamCard({ team, standalone }: { team: ReportRow[]; standalone: boolean }) {
  const [open, setOpen] = useState(true);
  const coordinator = team.find((r) => r.pessoa_id === r.coordenador_id);
  const missions = team.reduce((s, r) => s + n(r.missoes), 0);
  const done = team.reduce((s, r) => s + n(r.cumpridas), 0);
  const pending = team.reduce((s, r) => s + n(r.abriu_sem_concluir) + n(r.nao_abriu), 0);
  const indicated = team.reduce((s, r) => s + n(r.total_indicados), 0);
  const confirmed = team.reduce((s, r) => s + r.votos_confirmados, 0);
  const negative = team.reduce((s, r) => s + r.devolutivas_negativas, 0);
  const rate = missions ? (100 * done) / missions : 0;
  const members = team.filter((r) => r.pessoa_id !== coordinator?.pessoa_id);
  const byParent = new Map<string, ReportRow[]>();
  for (const member of members) {
    const parentKey =
      member.parent_id && team.some((r) => r.pessoa_id === member.parent_id)
        ? member.parent_id
        : "root";
    const list = byParent.get(parentKey) || [];
    list.push(member);
    byParent.set(parentKey, list);
  }
  for (const list of byParent.values())
    list.sort(
      (a, b) =>
        (a.cargo === "lider" ? -1 : 1) - (b.cargo === "lider" ? -1 : 1) ||
        a.nome.localeCompare(b.nome),
    );
  const roots = standalone
    ? members
    : (byParent.get(coordinator?.pessoa_id || "root") || []).concat(byParent.get("root") || []);

  return (
    <Card className={standalone ? "border-amber-400/60" : "overflow-hidden border-primary/20"}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex w-full flex-wrap items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40 ${standalone ? "bg-amber-50/60 dark:bg-amber-950/20" : "bg-primary/[0.04]"}`}
      >
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full ${standalone ? "bg-amber-500/15 text-amber-700" : "bg-primary/10 text-primary"}`}
        >
          {standalone ? <AlertCircle className="h-5 w-5" /> : <Crown className="h-5 w-5" />}
        </div>
        <div className="min-w-56 flex-1">
          <p className="text-base font-bold">
            {standalone ? "Sem coordenador" : coordinator?.nome || team[0].coordenador_nome}
          </p>
          <p className="text-xs text-muted-foreground">
            {team.length} contratados · {area(coordinator || team[0])}
          </p>
        </div>
        <TeamStat label="Cumpridas" value={done} tone="good" />
        <TeamStat label="Pendentes" value={pending} tone="bad" />
        <TeamStat label="Adesão" value={`${rate.toFixed(1)}%`} />
        <TeamStat label="Indicados" value={indicated} />
        <TeamStat label="Votos confirmados" value={confirmed} tone="good" />
        <TeamStat label="Negativas" value={negative} tone="bad" />
        <ChevronDown className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <CardContent className="border-t p-3 md:p-5">
          {!standalone && coordinator && (
            <TreePerson row={coordinator} level={0} accent="coordinator" />
          )}
          <div
            className={`${standalone ? "" : "ml-5 border-l-2 border-primary/20 pl-4"} space-y-2 pt-2`}
          >
            {roots.map((row) => (
              <TreeBranch
                key={row.pessoa_id}
                row={row}
                byParent={byParent}
                level={standalone ? 0 : 1}
              />
            ))}
            {!roots.length && (
              <p className="py-4 text-sm text-muted-foreground">
                Nenhum liderado contratado nesta equipe.
              </p>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function TreeBranch({
  row,
  byParent,
  level,
}: {
  row: ReportRow;
  byParent: Map<string, ReportRow[]>;
  level: number;
}) {
  const children = byParent.get(row.pessoa_id) || [];
  return (
    <div className="relative">
      <span className="absolute -left-4 top-5 h-px w-4 bg-border" />
      <TreePerson row={row} level={level} accent={row.cargo === "lider" ? "leader" : "member"} />
      {!!children.length && (
        <div className="ml-5 space-y-2 border-l-2 border-blue-200/70 pl-4 pt-2 dark:border-blue-800/60">
          {children.map((child) => (
            <TreeBranch key={child.pessoa_id} row={child} byParent={byParent} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function TreePerson({
  row: r,
  level,
  accent,
}: {
  row: ReportRow;
  level: number;
  accent: "coordinator" | "leader" | "member";
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`rounded-lg border ${accent === "coordinator" ? "border-primary/30 bg-primary/[0.035]" : accent === "leader" ? "border-blue-300/60 bg-blue-50/40 dark:bg-blue-950/20" : "bg-background"}`}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="grid w-full items-center gap-3 p-3 text-left md:grid-cols-[minmax(220px,1fr)_90px_90px_120px_120px_28px]"
      >
        <div className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${accent === "coordinator" ? "bg-primary text-primary-foreground" : accent === "leader" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"}`}
          >
            {accent === "coordinator" ? (
              <Crown className="h-4 w-4" />
            ) : (
              <UserRound className="h-4 w-4" />
            )}
          </div>
          <div>
            <p className="font-semibold">{r.nome}</p>
            <p className="text-xs text-muted-foreground">
              {r.cargo} · {r.telefone || "sem telefone"}
              {level > 0 && r.responsavel_nome ? ` · responde a ${r.responsavel_nome}` : ""}
            </p>
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Missões</p>
          <p className="font-semibold">
            {r.cumpridas}/{r.missoes}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Adesão</p>
          <p
            className={
              n(r.taxa) >= 80
                ? "font-bold text-emerald-700"
                : n(r.taxa) < 50
                  ? "font-bold text-destructive"
                  : "font-bold text-amber-700"
            }
          >
            {n(r.taxa).toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Lista</p>
          <p className="font-semibold">
            {r.total_indicados}/{r.meta_indicados} indicados
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Devolutivas</p>
          <p className="font-semibold">
            <span className="text-emerald-700">{r.votos_confirmados} sim</span>
            {" · "}
            <span className="text-destructive">{r.devolutivas_negativas} não</span>
          </p>
        </div>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <PersonDetails row={r} />}
    </div>
  );
}

function TeamStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "good" | "bad";
}) {
  return (
    <div className="min-w-20 text-center">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p
        className={`font-bold ${tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-destructive" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function PersonDetails({ row: r }: { row: ReportRow }) {
  return (
    <div className="grid gap-4 border-t bg-muted/20 p-3 lg:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Missões do período
        </p>
        {!r.missoes_detalhe.length ? (
          <p className="text-sm text-muted-foreground">Não recebeu missão.</p>
        ) : (
          r.missoes_detalhe.map((m) => (
            <div
              key={m.mission_id}
              className="mb-1 flex justify-between rounded bg-background p-2 text-xs"
            >
              <span>{m.titulo}</span>
              <Badge
                variant="outline"
                className={
                  m.status === "cumpriu"
                    ? "text-emerald-700"
                    : m.status === "abriu"
                      ? "text-amber-700"
                      : "text-destructive"
                }
              >
                {m.status === "cumpriu"
                  ? "Cumpriu"
                  : m.status === "abriu"
                    ? "Abriu, não concluiu"
                    : "Não abriu"}
              </Badge>
            </div>
          ))
        )}
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Indicados enviados
        </p>
        {!r.indicados_detalhe.length ? (
          <p className="text-sm text-muted-foreground">Nenhum indicado.</p>
        ) : (
          r.indicados_detalhe.map((i) => (
            <div key={i.id} className="mb-1 flex justify-between rounded bg-background p-2 text-xs">
              <span>
                <strong>{i.nome}</strong> · {i.telefone}
              </span>
              <span
                className={
                  i.vota_candidato === "sim"
                    ? "font-semibold text-emerald-700"
                    : i.vota_candidato === "nao"
                      ? "font-semibold text-destructive"
                      : "text-muted-foreground"
                }
              >
                {i.vota_candidato === "sim"
                  ? "Voto confirmado"
                  : i.vota_candidato === "nao"
                    ? `Negativa${i.candidato_alternativo ? ` · ${i.candidato_alternativo}` : ""}`
                    : i.status_telemarketing}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PersonRow({ row: r }: { row: ReportRow }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setOpen(!open)}>
        <TableCell>
          <div className="flex items-center gap-2">
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            <div>
              <p className="font-medium">{r.nome}</p>
              <p className="text-xs text-muted-foreground">
                {r.telefone} · {r.cargo}
              </p>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <p>{r.coordenador_nome || "Sem coordenador"}</p>
          <p className="text-xs text-muted-foreground">Responsável: {r.responsavel_nome || "—"}</p>
        </TableCell>
        <TableCell>{area(r)}</TableCell>
        <TableCell>
          <p className="font-medium">
            {r.cumpridas}/{r.missoes}
          </p>
          <Progress className="mt-1 h-1.5 w-24" value={n(r.taxa)} />
        </TableCell>
        <TableCell>
          <Badge variant="outline" className={badgeClass(r.faixa)}>
            {statusLabel[r.faixa] || r.faixa}
          </Badge>
        </TableCell>
        <TableCell>
          <p className="font-medium">
            {r.total_indicados}/{r.meta_indicados}
          </p>
          <p className="text-xs text-muted-foreground">
            {listLabel[r.situacao_lista] || r.situacao_lista}
          </p>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/25 p-4">
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <h4 className="mb-2 font-semibold">Missões no período</h4>
                {!r.missoes_detalhe.length ? (
                  <p className="text-sm text-muted-foreground">Não recebeu missão no período.</p>
                ) : (
                  <div className="space-y-2">
                    {r.missoes_detalhe.map((m) => (
                      <div
                        key={m.mission_id}
                        className="flex items-center justify-between rounded border bg-background p-2 text-sm"
                      >
                        <div>
                          <p className="font-medium">{m.titulo || "Missão"}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(m.publicado_em).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            m.status === "cumpriu"
                              ? "text-emerald-700"
                              : m.status === "abriu"
                                ? "text-amber-700"
                                : "text-destructive"
                          }
                        >
                          {m.status === "cumpriu"
                            ? "Cumpriu"
                            : m.status === "abriu"
                              ? "Abriu, não concluiu"
                              : "Não abriu"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h4 className="mb-2 font-semibold">Lista enviada por {r.nome}</h4>
                {!r.indicados_detalhe.length ? (
                  <p className="text-sm text-muted-foreground">Nenhum indicado enviado.</p>
                ) : (
                  <div className="space-y-2">
                    {r.indicados_detalhe.map((i) => (
                      <div
                        key={i.id}
                        className="flex items-center justify-between rounded border bg-background p-2 text-sm"
                      >
                        <div>
                          <p className="font-medium">{i.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            {i.telefone} · {i.cidade || i.bairro || "sem local"}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline">{i.status_telemarketing}</Badge>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {new Date(i.created_at).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

type Group = {
  name: string;
  people: number;
  missions: number;
  done: number;
  opened: number;
  missed: number;
  indicated: number;
  senders: number;
  confirmed: number;
  negative: number;
  rate: number;
};
function groupRows(rows: ReportRow[], key: (r: ReportRow) => string): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const name = key(r);
    const g = map.get(name) || {
      name,
      people: 0,
      missions: 0,
      done: 0,
      opened: 0,
      missed: 0,
      indicated: 0,
      senders: 0,
      confirmed: 0,
      negative: 0,
      rate: 0,
    };
    g.people++;
    g.missions += n(r.missoes);
    g.done += n(r.cumpridas);
    g.opened += n(r.abriu_sem_concluir);
    g.missed += n(r.nao_abriu);
    g.indicated += n(r.total_indicados);
    g.confirmed += r.votos_confirmados;
    g.negative += r.devolutivas_negativas;
    if (n(r.total_indicados) > 0) g.senders++;
    map.set(name, g);
  }
  return Array.from(map.values())
    .map((g) => ({ ...g, rate: g.missions ? (100 * g.done) / g.missions : 0 }))
    .sort((a, b) => b.people - a.people || a.name.localeCompare(b.name));
}
function GroupTable({ rows, label }: { rows: Group[]; label: string }) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{label}</TableHead>
              <TableHead>Contratados</TableHead>
              <TableHead>Missões</TableHead>
              <TableHead>Cumpriram</TableHead>
              <TableHead>Pendentes</TableHead>
              <TableHead>Taxa</TableHead>
              <TableHead>Listas / indicados</TableHead>
              <TableHead>Votos confirmados</TableHead>
              <TableHead>Negativas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((g) => (
              <TableRow key={g.name}>
                <TableCell className="font-medium">{g.name}</TableCell>
                <TableCell>{g.people}</TableCell>
                <TableCell>{g.missions}</TableCell>
                <TableCell className="text-emerald-700">{g.done}</TableCell>
                <TableCell className="text-destructive">{g.opened + g.missed}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={g.rate} className="h-2 w-24" />
                    <span>{g.rate.toFixed(1)}%</span>
                  </div>
                </TableCell>
                <TableCell>
                  {g.senders}/{g.people} enviaram · {g.indicated} nomes
                </TableCell>
                <TableCell className="font-semibold text-emerald-700">{g.confirmed}</TableCell>
                <TableCell className="font-semibold text-destructive">{g.negative}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
