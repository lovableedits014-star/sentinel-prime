/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  DollarSign,
  FileSpreadsheet,
  Loader2,
  Search,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentClientId } from "@/hooks/ic/useCurrentClientId";
import { useRegioesEleicao } from "@/hooks/useRegioesEleicao";
import { isEleicaoContratadoRemunerado } from "@/lib/eleicao-situacao";
import {
  classificarBairroCampoGrande,
  normalizarLocalidade,
  REGIAO_CAMPO_GRANDE_LABEL,
} from "@/lib/campo-grande-regioes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Cargo = "Presidente" | "Governador" | "Senador" | "Deputado Federal" | "Deputado Estadual";
type Candidate = {
  numero: number;
  nome_urna: string | null;
  nome_completo: string | null;
  partido: string | null;
  votos: number;
};
type SectionRow = {
  zona: number;
  secao: number;
  bairro: string | null;
  votos: number;
};
type ContractRow = {
  id: string;
  nome: string;
  tipo: string;
  escopo: string;
  regiao: string | null;
  valor_contratacao: number | null;
  is_voluntario: boolean | null;
  is_favorito_regiao: boolean | null;
  arquivado_em: string | null;
};
type OverrideRow = { bairro_normalizado: string; regiao_value: string };
type RegionalRow = {
  key: string;
  label: string;
  coordenador: string;
  contratos: number;
  investimento: number;
  custoMedioContrato: number;
  votos: number;
  secoes: number;
  custoPorVoto: number | null;
  votosPorContratado: number | null;
  participacao: number;
  ranking: number;
};

const CARGOS: Cargo[] = [
  "Presidente",
  "Governador",
  "Senador",
  "Deputado Federal",
  "Deputado Estadual",
];
const PAGE_SIZE = 1000;
const CAMPO_GRANDE_CODE = 90514;
const fmt = (value: number) => Number(value || 0).toLocaleString("pt-BR");
const money = (value: number | null) =>
  value === null ? "—" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function CustoRegionalEleitoral() {
  const queryClient = useQueryClient();
  const { data: clientId = null } = useCurrentClientId();
  const { regioes } = useRegioesEleicao(clientId || undefined);
  const [cargo, setCargo] = useState<Cargo>("Deputado Estadual");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ processed: 0, total: 0 });

  const regioesCampoGrande = useMemo(
    () => regioes.filter((region) => region.escopo !== "interior"),
    [regioes],
  );
  const regionLabels = useMemo(() => {
    const labels = new Map<string, string>();
    regioesCampoGrande.forEach((region) => labels.set(region.value, region.label));
    Object.entries(REGIAO_CAMPO_GRANDE_LABEL).forEach(([key, label]) => {
      if (!labels.has(key)) labels.set(key, label);
    });
    return labels;
  }, [regioesCampoGrande]);
  const configuredRegionKeys = useMemo(
    () => new Set(regioesCampoGrande.map((region) => region.value)),
    [regioesCampoGrande],
  );

  const { data: ranking = [], isLoading: loadingRanking } = useQuery({
    queryKey: ["tse-cost-region-ranking", cargo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tse_candidate_ranking" as any, {
        p_ano: 2026,
        p_uf: "MS",
        p_cargo: cargo,
        p_municipio: "CAMPO GRANDE",
      });
      if (error) throw error;
      return ((data || []) as any[]).map((row) => ({
        numero: Number(row.numero),
        nome_urna: row.nome_urna,
        nome_completo: row.nome_completo,
        partido: row.partido,
        votos: Number(row.votos || 0),
      })) as Candidate[];
    },
  });

  const { data: syncStatus = null, refetch: refetchStatus } = useQuery({
    queryKey: ["tse-cost-region-sync-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tse_secao_sync_status" as any)
        .select("status,secoes_principais,secoes_processadas,erro")
        .eq("ano", 2026)
        .eq("turno", 1)
        .eq("uf", "MS")
        .eq("cod_municipio", CAMPO_GRANDE_CODE)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: sections = [], isLoading: loadingSections } = useQuery({
    queryKey: ["tse-cost-region-sections", cargo, selected],
    enabled: selected !== null && syncStatus?.status === "success",
    queryFn: async () => {
      const rows: any[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .rpc("get_tse_candidate_sections" as any, {
            p_ano: 2026,
            p_uf: "MS",
            p_cod_municipio: CAMPO_GRANDE_CODE,
            p_cargo: cargo,
            p_numero: selected,
          })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        const page = (data || []) as any[];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }
      return rows.map((row) => ({
        zona: Number(row.zona),
        secao: Number(row.secao),
        bairro: row.bairro,
        votos: Number(row.votos || 0),
      })) as SectionRow[];
    },
  });

  const { data: people = [], isLoading: loadingPeople } = useQuery({
    queryKey: ["election-cost-region-contracts", clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const rows: ContractRow[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .rpc("get_eleicao_pessoas_for_client" as any, { _client_id: clientId })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        const page = (data || []) as ContractRow[];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }
      return rows;
    },
  });

  const { data: overrides = [] } = useQuery({
    queryKey: ["election-neighborhood-region-overrides", clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eleicao_bairro_regiao" as any)
        .select("bairro_normalizado,regiao_value")
        .eq("client_id", clientId!)
        .eq("municipio", "CAMPO GRANDE");
      if (error) throw error;
      return (data || []) as OverrideRow[];
    },
  });
  const overrideMap = useMemo(
    () => new Map(overrides.map((row) => [row.bairro_normalizado, row.regiao_value])),
    [overrides],
  );

  const saveMapping = useMutation({
    mutationFn: async ({ bairro, regiao }: { bairro: string; regiao: string }) => {
      if (!clientId) throw new Error("Campanha não identificada.");
      const { error } = await supabase.from("eleicao_bairro_regiao" as any).upsert(
        {
          client_id: clientId,
          municipio: "CAMPO GRANDE",
          bairro,
          bairro_normalizado: normalizarLocalidade(bairro),
          regiao_value: regiao,
          fonte: "manual",
        },
        { onConflict: "client_id,municipio,bairro_normalizado" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["election-neighborhood-region-overrides", clientId],
      });
      toast.success("Bairro vinculado à região.");
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível salvar o vínculo."),
  });

  const candidate = ranking.find((row) => row.numero === selected) || null;
  const filteredRanking = useMemo(() => {
    const term = candidateSearch.trim().toLocaleLowerCase("pt-BR");
    return ranking
      .filter((row) =>
        !term
          ? true
          : `${row.numero} ${row.nome_urna || ""} ${row.nome_completo || ""} ${row.partido || ""}`
              .toLocaleLowerCase("pt-BR")
              .includes(term),
      )
      .slice(0, term ? 100 : 30);
  }, [candidateSearch, ranking]);

  const contractsByRegion = useMemo(() => {
    const grouped = new Map<string, { contratos: number; investimento: number }>();
    people
      .filter((person) => person.escopo === "campo_grande" && isEleicaoContratadoRemunerado(person))
      .forEach((person) => {
        const key = String(person.regiao || "sem-regiao")
          .trim()
          .toLocaleLowerCase("pt-BR");
        const current = grouped.get(key) || { contratos: 0, investimento: 0 };
        current.contratos += 1;
        current.investimento += Number(person.valor_contratacao || 0);
        grouped.set(key, current);
      });
    return grouped;
  }, [people]);

  const coordinatorsByRegion = useMemo(() => {
    const grouped = new Map<string, string[]>();
    people
      .filter(
        (person) =>
          person.escopo === "campo_grande" && person.tipo === "coordenador" && !person.arquivado_em,
      )
      .sort((a, b) => Number(Boolean(b.is_favorito_regiao)) - Number(Boolean(a.is_favorito_regiao)))
      .forEach((person) => {
        const key = String(person.regiao || "sem-regiao")
          .trim()
          .toLocaleLowerCase("pt-BR");
        const names = grouped.get(key) || [];
        if (!names.includes(person.nome)) names.push(person.nome);
        grouped.set(key, names);
      });
    return new Map(Array.from(grouped, ([key, names]) => [key, names.join(" / ")]));
  }, [people]);

  const { votesByRegion, unclassified } = useMemo(() => {
    const grouped = new Map<string, { votos: number; secoes: number }>();
    const unknown = new Map<string, { bairro: string; votos: number; secoes: number }>();
    sections.forEach((section) => {
      const classification = classificarBairroCampoGrande(
        section.bairro,
        overrideMap,
        configuredRegionKeys,
      );
      if (classification.regiao) {
        const current = grouped.get(classification.regiao) || { votos: 0, secoes: 0 };
        current.votos += section.votos;
        current.secoes += 1;
        grouped.set(classification.regiao, current);
      } else {
        const bairro = section.bairro?.trim() || "Bairro não informado";
        const key = normalizarLocalidade(bairro) || "SEM BAIRRO";
        const current = unknown.get(key) || { bairro, votos: 0, secoes: 0 };
        current.votos += section.votos;
        current.secoes += 1;
        unknown.set(key, current);
      }
    });
    return {
      votesByRegion: grouped,
      unclassified: Array.from(unknown.values()).sort((a, b) => b.votos - a.votos),
    };
  }, [configuredRegionKeys, overrideMap, sections]);

  const regionalRows = useMemo<RegionalRow[]>(() => {
    const keys = new Set([
      ...regionLabels.keys(),
      ...contractsByRegion.keys(),
      ...votesByRegion.keys(),
    ]);
    keys.delete("sem-regiao");
    const totalRegionalVotes = Array.from(keys).reduce(
      (sum, key) => sum + (votesByRegion.get(key)?.votos || 0),
      0,
    );
    const rows = Array.from(keys)
      .map((key) => {
        const contract = contractsByRegion.get(key) || { contratos: 0, investimento: 0 };
        const vote = votesByRegion.get(key) || { votos: 0, secoes: 0 };
        return {
          key,
          label: regionLabels.get(key) || key,
          coordenador: coordinatorsByRegion.get(key) || "Não definido",
          ...contract,
          ...vote,
          custoMedioContrato: contract.contratos ? contract.investimento / contract.contratos : 0,
          custoPorVoto:
            vote.votos && contract.investimento > 0 ? contract.investimento / vote.votos : null,
          votosPorContratado: contract.contratos ? vote.votos / contract.contratos : null,
          participacao: totalRegionalVotes ? (100 * vote.votos) / totalRegionalVotes : 0,
          ranking: 0,
        };
      })
      .sort(
        (a, b) =>
          (a.custoPorVoto ?? Number.POSITIVE_INFINITY) -
            (b.custoPorVoto ?? Number.POSITIVE_INFINITY) || b.votos - a.votos,
      );
    let ranking = 0;
    return rows.map((row) => ({
      ...row,
      ranking: row.custoPorVoto === null ? 0 : ++ranking,
    }));
  }, [contractsByRegion, coordinatorsByRegion, regionLabels, votesByRegion]);

  const totalInvestment = regionalRows.reduce((sum, row) => sum + row.investimento, 0);
  const totalContracts = regionalRows.reduce((sum, row) => sum + row.contratos, 0);
  const classifiedVotes = regionalRows.reduce((sum, row) => sum + row.votos, 0);
  const unclassifiedVotes = unclassified.reduce((sum, row) => sum + row.votos, 0);
  const totalVotes = classifiedVotes + unclassifiedVotes;
  const voteTotalsMatch = Boolean(candidate && sections.length && totalVotes === candidate.votos);
  const coverage = sections.length
    ? (100 * (sections.length - unclassified.reduce((sum, row) => sum + row.secoes, 0))) /
      sections.length
    : 0;

  const syncSections = async () => {
    setSyncing(true);
    try {
      for (let batch = 0; batch < 100; batch += 1) {
        const { data, error } = await supabase.functions.invoke("sync-tse-sections", {
          body: { uf: "MS", cod_municipio: CAMPO_GRANDE_CODE, batch_size: 80 },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setSyncProgress({ processed: Number(data.processed || 0), total: Number(data.total || 0) });
        if (data.complete) break;
      }
      await refetchStatus();
      await queryClient.invalidateQueries({ queryKey: ["tse-cost-region-sections"] });
      toast.success("Seções de Campo Grande sincronizadas.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao sincronizar as seções.");
    } finally {
      setSyncing(false);
    }
  };

  const exportXlsx = () => {
    if (!candidate || !sections.length) return;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          Ano: 2026,
          Cidade: "Campo Grande/MS",
          Cargo: cargo,
          Candidato: candidate.nome_urna || candidate.nome_completo,
          Número: candidate.numero,
          "Investimento contratado": totalInvestment,
          Contratados: totalContracts,
          "Votos classificados": classifiedVotes,
          "Votos não classificados": unclassifiedVotes,
          "Votos oficiais do candidato": candidate.votos,
          "Votos somados nas seções": totalVotes,
          Conferência: voteTotalsMatch ? "TOTAL CONFERIDO" : "DIVERGÊNCIA",
          "Cobertura das seções (%)": Number(coverage.toFixed(2)),
          "Custo por voto geral": totalVotes ? totalInvestment / totalVotes : null,
        },
      ]),
      "Resumo",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        regionalRows.map((row) => ({
          Ranking: row.ranking || null,
          Região: row.label,
          "Coordenador responsável": row.coordenador,
          Contratados: row.contratos,
          Investimento: row.investimento,
          "Custo médio por contrato": Number(row.custoMedioContrato.toFixed(2)),
          Votos: row.votos,
          "Participação nos votos (%)": Number(row.participacao.toFixed(2)),
          Seções: row.secoes,
          "Custo por voto": row.custoPorVoto === null ? null : Number(row.custoPorVoto.toFixed(2)),
          "Votos por contratado":
            row.votosPorContratado === null ? null : Number(row.votosPorContratado.toFixed(2)),
        })),
      ),
      "Custo por região",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(unclassified),
      "Revisar bairros",
    );
    XLSX.writeFile(workbook, `campo-grande-2026-custo-regional-${candidate.numero}.xlsx`);
  };

  const exportPdf = () => {
    if (!candidate || !sections.length) return;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Relatório gerencial — investimento e resultado eleitoral", 14, 16);
    doc.setFontSize(10);
    doc.text(
      `Campo Grande/MS · Eleições 2026 · ${cargo} · ${candidate.nome_urna || candidate.nome_completo} #${candidate.numero}`,
      14,
      24,
    );
    doc.text(
      `Investimento: ${money(totalInvestment)} · Votos: ${fmt(totalVotes)} · Custo médio: ${money(totalVotes ? totalInvestment / totalVotes : null)}`,
      14,
      31,
    );
    autoTable(doc, {
      startY: 39,
      head: [
        [
          "Rank",
          "Região",
          "Coordenador",
          "Investimento",
          "Votos",
          "% votos",
          "Custo/voto",
          "Contratados",
        ],
      ],
      body: regionalRows.map((row) => [
        row.ranking ? `${row.ranking}º` : "—",
        row.label,
        row.coordenador,
        money(row.investimento),
        fmt(row.votos),
        `${row.participacao.toFixed(1).replace(".", ",")}%`,
        money(row.custoPorVoto),
        fmt(row.contratos),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [5, 150, 105] },
    });
    doc.save(`campo-grande-2026-relatorio-gerencial-${candidate.numero}.pdf`);
  };

  return (
    <div className="space-y-5">
      <Card className="border-emerald-500/40 shadow-sm overflow-hidden">
        <div className="h-1 bg-emerald-600" />
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <Badge className="mb-2 bg-emerald-600">Campo Grande · custo e votos</Badge>
              <CardTitle className="flex items-center gap-2 text-xl">
                <DollarSign className="w-5 h-5" /> Quanto cada região custou por voto?
              </CardTitle>
              <CardDescription className="mt-1 max-w-3xl">
                Cruza os contratos remunerados ativos com os votos oficiais por seção. Os bairros
                são convertidos para as regiões operacionais da campanha.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={exportXlsx} disabled={!voteTotalsMatch}>
                <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel
              </Button>
              <Button onClick={exportPdf} disabled={!voteTotalsMatch}>
                <Download className="w-4 h-4 mr-2" /> PDF gerencial
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1 text-sm font-medium">
              1. Cargo
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {CARGOS.map((item) => (
                  <Button
                    key={item}
                    size="sm"
                    variant={cargo === item ? "default" : "outline"}
                    className="h-10"
                    onClick={() => {
                      setCargo(item);
                      setSelected(null);
                    }}
                  >
                    {item.replace("Deputado ", "Dep. ")}
                  </Button>
                ))}
              </div>
            </div>
            <label className="space-y-1 text-sm font-medium">
              2. Candidato
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={candidateSearch}
                  onChange={(event) => setCandidateSearch(event.target.value)}
                  placeholder="Nome, número ou partido"
                />
              </div>
            </label>
          </div>
          {loadingRanking ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando candidatos...
            </p>
          ) : (
            <div className="border rounded-lg max-h-60 overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Candidato</TableHead>
                    <TableHead className="text-right">Votos em Campo Grande</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRanking.map((row) => (
                    <TableRow
                      key={row.numero}
                      className={selected === row.numero ? "bg-primary/10" : "cursor-pointer"}
                      onClick={() => setSelected(row.numero)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {selected === row.numero && (
                            <CheckCircle2 className="w-4 h-4 text-primary" />
                          )}
                          <div>
                            <div className="font-medium">{row.nome_urna || row.nome_completo}</div>
                            <div className="text-xs text-muted-foreground">
                              #{row.numero} · {row.partido || "—"}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{fmt(row.votos)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {candidate && syncStatus?.status !== "success" && (
        <Card className="border-blue-500/40">
          <CardHeader>
            <CardTitle className="text-base">Preparar votos por seção</CardTitle>
            <CardDescription>
              A carga oficial de Campo Grande precisa estar completa antes do cálculo regional.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {syncing && (
              <>
                <Progress
                  value={
                    syncProgress.total ? (100 * syncProgress.processed) / syncProgress.total : 0
                  }
                />
                <p className="text-sm text-muted-foreground">
                  {fmt(syncProgress.processed)} de {fmt(syncProgress.total)} boletins
                </p>
              </>
            )}
            <Button onClick={syncSections} disabled={syncing}>
              {syncing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Sincronizar seções de Campo Grande
            </Button>
          </CardContent>
        </Card>
      )}

      {candidate && syncStatus?.status === "success" && (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
            <Metric label="Investimento contratado" value={money(totalInvestment)} />
            <Metric label="Contratados remunerados" value={fmt(totalContracts)} />
            <Metric label="Votos somados nas seções" value={fmt(totalVotes)} ok={voteTotalsMatch} />
            <Metric
              label="Custo geral por voto"
              value={money(totalVotes ? totalInvestment / totalVotes : null)}
            />
            <Metric
              label="Seções classificadas"
              value={
                loadingSections ? "Conferindo..." : `${coverage.toFixed(1).replace(".", ",")}%`
              }
              ok={coverage === 100}
            />
          </div>

          {!clientId && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Selecione uma campanha para carregar os custos dos contratados.
            </div>
          )}

          {!loadingSections && sections.length > 0 && !voteTotalsMatch && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> A soma das seções ({fmt(totalVotes)})
              não fecha com o total oficial ({fmt(candidate.votos)}). A exportação foi bloqueada até
              a conferência.
            </div>
          )}

          <div className="grid xl:grid-cols-[0.8fr_1.2fr] gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Investimento x votos por região</CardTitle>
                <CardDescription>As barras mostram o custo por voto regional.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[430px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={regionalRows}
                      layout="vertical"
                      margin={{ left: 20, right: 30 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="label" width={105} tick={{ fontSize: 10 }} />
                      <Tooltip
                        formatter={(value, name) => [
                          name === "custoPorVoto" ? money(Number(value)) : fmt(Number(value)),
                          name === "custoPorVoto" ? "Custo por voto" : "Votos",
                        ]}
                      />
                      <Bar dataKey="custoPorVoto" fill="#059669" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resultado financeiro por região</CardTitle>
                <CardDescription>
                  Considera apenas contratos remunerados ativos de Campo Grande.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[520px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="text-center">Rank</TableHead>
                        <TableHead>Região</TableHead>
                        <TableHead>Coordenador</TableHead>
                        <TableHead className="text-right">Contratados</TableHead>
                        <TableHead className="text-right">Investimento</TableHead>
                        <TableHead className="text-right">Média/contrato</TableHead>
                        <TableHead className="text-right">Votos</TableHead>
                        <TableHead className="text-right">% dos votos</TableHead>
                        <TableHead className="text-right">Custo/voto</TableHead>
                        <TableHead className="text-right">Votos/contratado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {regionalRows.map((row) => (
                        <TableRow key={row.key}>
                          <TableCell className="text-center font-bold">
                            {row.ranking ? `${row.ranking}º` : "—"}
                          </TableCell>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className="min-w-40">{row.coordenador}</TableCell>
                          <TableCell className="text-right">{fmt(row.contratos)}</TableCell>
                          <TableCell className="text-right">{money(row.investimento)}</TableCell>
                          <TableCell className="text-right">
                            {money(row.custoMedioContrato)}
                          </TableCell>
                          <TableCell className="text-right font-bold">{fmt(row.votos)}</TableCell>
                          <TableCell className="text-right">
                            {row.participacao.toFixed(1).replace(".", ",")}%
                          </TableCell>
                          <TableCell className="text-right font-semibold text-emerald-700">
                            {money(row.custoPorVoto)}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.votosPorContratado === null
                              ? "—"
                              : fmt(Math.round(row.votosPorContratado))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          {unclassified.length > 0 && (
            <Card className="border-amber-500/40">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" /> Revisar bairros sem região
                </CardTitle>
                <CardDescription>
                  Estes nomes não tiveram correspondência segura no mapa da PLANURB. Escolha a
                  região correta; o vínculo ficará salvo e o cálculo será atualizado imediatamente.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-80 overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead>Bairro/localidade</TableHead>
                        <TableHead className="text-right">Seções</TableHead>
                        <TableHead className="text-right">Votos</TableHead>
                        <TableHead>Definir região</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unclassified.map((row) => (
                        <TableRow key={normalizarLocalidade(row.bairro)}>
                          <TableCell className="font-medium">{row.bairro}</TableCell>
                          <TableCell className="text-right">{fmt(row.secoes)}</TableCell>
                          <TableCell className="text-right">{fmt(row.votos)}</TableCell>
                          <TableCell>
                            <select
                              className="h-9 w-full min-w-40 rounded-md border bg-background px-2 text-sm"
                              defaultValue=""
                              disabled={!clientId || saveMapping.isPending}
                              onChange={(event) => {
                                if (event.target.value) {
                                  saveMapping.mutate({
                                    bairro: row.bairro,
                                    regiao: event.target.value,
                                  });
                                }
                              }}
                            >
                              <option value="">Selecionar...</option>
                              {Array.from(regionLabels.entries()).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            Fonte territorial: Anexo 4 da PLANURB — Mapa das Regiões Urbanas e Bairros de Campo
            Grande. “Moreninha” é tratada como região operacional separada quando estiver cadastrada
            na campanha. Localidades rurais ou nomes genéricos permanecem em revisão.
          </div>
        </>
      )}

      {(loadingPeople || loadingSections) && candidate && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Cruzando contratos, regiões e votos...
        </p>
      )}
    </div>
  );
}

function Metric({ label, value, ok = false }: { label: string; value: string; ok?: boolean }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-xl font-bold mt-1 ${ok ? "text-emerald-600" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
