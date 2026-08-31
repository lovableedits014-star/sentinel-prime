import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowDownUp, CheckCircle2, FileDown, FileSpreadsheet, FilterX, Loader2,
  Phone, RefreshCw, Search, UserCheck, Users, Vote,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface ReportRow {
  contato_id: string;
  indicador_id: string;
  indicador_nome: string;
  indicador_tipo: string;
  indicador_regiao: string | null;
  nome: string;
  telefone: string;
  cidade: string | null;
  bairro: string | null;
  status_telemarketing: string | null;
  ultimo_status_ligacao: string | null;
  vota_candidato: string | null;
  candidato_alternativo: string | null;
  operador_nome: string | null;
  ultima_ligacao_em: string | null;
  total_tentativas: number;
  proxima_tentativa_em: string | null;
  campanha_id: string | null;
  campanha_nome: string | null;
  inativo: boolean;
  inativado_em: string | null;
}

interface Summary {
  indicadorId: string;
  nome: string;
  tipo: string;
  regiao: string;
  total: number;
  trabalhados: number;
  tentativas: number;
  atendidos: number;
  sim: number;
  nao: number;
  indecisos: number;
  naoAtendeu: number;
  recusou: number;
  invalidos: number;
  pendentes: number;
  reagendados: number;
  inativos: number;
  cobertura: number;
  taxaContato: number;
  conversao: number;
  votoBase: number;
}

const ALL = "__all__";
const INDICATOR_PAGE_SIZE = 1000;
const TIPO_LABEL: Record<string, string> = { coordenador: "Coordenador", lider: "Líder", cabo: "Cabo" };
const RESULT_LABEL: Record<string, string> = {
  atendeu: "Atendeu", nao_atendeu: "Não atendeu", recusou: "Recusou",
  invalido: "Inválido", numero_invalido: "Número inválido", pendente: "Pendente",
};
const VOTE_LABEL: Record<string, string> = {
  sim: "Sim", nao: "Não", indeciso: "Indeciso", nao_quis_opinar: "Não quis opinar",
};

const pct = (part: number, total: number) => total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
const clean = (value: string | null | undefined) => value?.trim() || "—";
const voteLabel = (value: string | null) => value ? VOTE_LABEL[value] || value : "Sem resposta";
const alternativeCandidate = (row: ReportRow) => row.vota_candidato === "nao"
  ? row.candidato_alternativo?.trim() || "Não informado"
  : "—";
const filename = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

function summarize(rows: ReportRow[]): Summary[] {
  const groups = new Map<string, ReportRow[]>();
  rows.forEach((row) => groups.set(row.indicador_id, [...(groups.get(row.indicador_id) || []), row]));
  return [...groups.entries()].map(([indicadorId, data]) => {
    const first = data[0];
    const trabalhados = data.filter((r) => r.ultima_ligacao_em || r.total_tentativas > 0).length;
    const atendidos = data.filter((r) => r.ultimo_status_ligacao === "atendeu").length;
    const sim = data.filter((r) => r.vota_candidato === "sim").length;
    const nao = data.filter((r) => r.vota_candidato === "nao").length;
    const indecisos = data.filter((r) => r.vota_candidato === "indeciso").length;
    const naoAtendeu = data.filter((r) => r.ultimo_status_ligacao === "nao_atendeu").length;
    const recusou = data.filter((r) => r.ultimo_status_ligacao === "recusou").length;
    const invalidos = data.filter((r) => ["invalido", "numero_invalido"].includes(r.ultimo_status_ligacao || "") || r.status_telemarketing === "descartado").length;
    const reagendados = data.filter((r) => r.status_telemarketing === "agendado" && !!r.proxima_tentativa_em).length;
    const inativos = data.filter((r) => r.inativo).length;
    const tentativas = data.reduce((sum, r) => sum + (r.total_tentativas || 0), 0);
    return {
      indicadorId, nome: first?.indicador_nome || "Sem nome", tipo: first?.indicador_tipo || "—",
      regiao: first?.indicador_regiao || "—", total: data.length, trabalhados, tentativas, atendidos,
      sim, nao, indecisos, naoAtendeu, recusou, invalidos, pendentes: data.length - trabalhados,
      reagendados, inativos, cobertura: pct(trabalhados, data.length), taxaContato: pct(atendidos, trabalhados),
      conversao: pct(sim, atendidos), votoBase: pct(sim, data.length),
    };
  });
}

export default function TelemarketingIndicadorScorecard({ clientId, campanhaId = null }: { clientId: string; campanhaId?: string | null }) {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Summary | null>(null);
  const [sort, setSort] = useState<keyof Summary>("sim");
  const [indicator, setIndicator] = useState(ALL);
  const [search, setSearch] = useState("");
  const [type, setType] = useState(ALL);
  const [campaign, setCampaign] = useState(ALL);
  const [operator, setOperator] = useState(ALL);
  const [result, setResult] = useState(ALL);
  const [vote, setVote] = useState(ALL);
  const [region, setRegion] = useState(ALL);
  const [city, setCity] = useState(ALL);
  const [neighborhood, setNeighborhood] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async (notify = false) => {
    setLoading(true);
    const allRows: ReportRow[] = [];
    let page = 0;
    let error: { message: string } | null = null;
    while (true) {
      const fromRow = page * INDICATOR_PAGE_SIZE;
      const response = await supabase
        .rpc("tele_indicador_report_rows", { _client_id: clientId })
        .order("indicador_id", { ascending: true })
        .order("contato_id", { ascending: true })
        .range(fromRow, fromRow + INDICATOR_PAGE_SIZE - 1);
      if (response.error) { error = response.error; break; }
      const pageRows = (response.data || []) as ReportRow[];
      allRows.push(...pageRows);
      if (pageRows.length < INDICATOR_PAGE_SIZE) break;
      page += 1;
    }
    setLoading(false);
    if (error) { toast.error(`Erro ao carregar relatório: ${error.message}`); return; }
    setRows(allRows);
    if (notify) toast.success("Relatório atualizado");
  }, [clientId]);

  useEffect(() => { if (clientId) void load(); }, [clientId, load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load]);

  const options = useMemo(() => ({
    indicators: [...new Map(rows.map((r) => [r.indicador_id, r.indicador_nome])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    campaigns: [...new Set(rows.map((r) => r.campanha_nome).filter(Boolean) as string[])].sort(),
    operators: [...new Set(rows.map((r) => r.operador_nome).filter(Boolean) as string[])].sort(),
    regions: [...new Set(rows.map((r) => r.indicador_regiao).filter(Boolean) as string[])].sort(),
    cities: [...new Set(rows.map((r) => r.cidade).filter(Boolean) as string[])].sort(),
    neighborhoods: [...new Set(rows.map((r) => r.bairro).filter(Boolean) as string[])].sort(),
  }), [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (campanhaId && r.campanha_id !== campanhaId) return false;
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (query && !`${r.indicador_nome} ${r.nome} ${r.telefone}`.toLocaleLowerCase("pt-BR").includes(query)) return false;
    if (indicator !== ALL && r.indicador_id !== indicator) return false;
    if (type !== ALL && r.indicador_tipo !== type) return false;
    if (campaign !== ALL && clean(r.campanha_nome) !== campaign) return false;
    if (operator !== ALL && clean(r.operador_nome) !== operator) return false;
    if (region !== ALL && clean(r.indicador_regiao) !== region) return false;
    if (city !== ALL && clean(r.cidade) !== city) return false;
    if (neighborhood !== ALL && clean(r.bairro) !== neighborhood) return false;
    if (vote !== ALL && (r.vota_candidato || "sem_resposta") !== vote) return false;
    const normalizedResult = r.ultima_ligacao_em ? (r.ultimo_status_ligacao || "trabalhado") : "pendente";
    if (result !== ALL && normalizedResult !== result) return false;
    if (from && (!r.ultima_ligacao_em || r.ultima_ligacao_em.slice(0, 10) < from)) return false;
    if (to && (!r.ultima_ligacao_em || r.ultima_ligacao_em.slice(0, 10) > to)) return false;
    return true;
  }), [rows, campanhaId, search, indicator, type, campaign, operator, region, city, neighborhood, vote, result, from, to]);

  const summaries = useMemo(() => summarize(filtered).sort((a, b) => Number(b[sort]) - Number(a[sort]) || a.nome.localeCompare(b.nome)), [filtered, sort]);
  const totals = useMemo(() => summarize(filtered.map((r) => ({ ...r, indicador_id: "total", indicador_nome: "Total" })))[0] || null, [filtered]);
  const activeFilters = [search, indicator, type, campaign, operator, result, vote, region, city, neighborhood, from, to].filter((v) => v && v !== ALL).length;

  const resetFilters = () => {
    setSearch(""); setIndicator(ALL); setType(ALL); setCampaign(ALL); setOperator(ALL);
    setResult(ALL); setVote(ALL); setRegion(ALL); setCity(ALL); setNeighborhood(ALL); setFrom(""); setTo("");
  };

  const scopeRows = (individual = false, indicadorId?: string) => {
    const targetId = indicadorId || (indicator !== ALL ? indicator : null);
    return individual && targetId ? filtered.filter((r) => r.indicador_id === targetId) : filtered;
  };
  const filterDescription = () => [
    campaign !== ALL && `Campanha: ${campaign}`, indicator !== ALL && `Indicador: ${options.indicators.find(([id]) => id === indicator)?.[1]}`,
    type !== ALL && `Cargo: ${TIPO_LABEL[type] || type}`, operator !== ALL && `Operador: ${operator}`,
    from && `De: ${new Date(`${from}T12:00:00`).toLocaleDateString("pt-BR")}`, to && `Até: ${new Date(`${to}T12:00:00`).toLocaleDateString("pt-BR")}`,
    result !== ALL && `Resultado: ${RESULT_LABEL[result] || result}`, vote !== ALL && `Voto: ${vote}`,
  ].filter(Boolean).join(" | ") || "Todos os dados";

  const exportExcel = (individual = false, indicadorId?: string) => {
    const data = scopeRows(individual, indicadorId);
    const summary = summarize(data);
    const wb = XLSX.utils.book_new();
    const resumo = summary.map((s) => ({
      Indicador: s.nome, Cargo: TIPO_LABEL[s.tipo] || s.tipo, Região: s.regiao, Indicados: s.total,
      Trabalhados: s.trabalhados, "Cobertura (%)": s.cobertura, Tentativas: s.tentativas, Atendidos: s.atendidos,
      "Taxa contato (%)": s.taxaContato, Sim: s.sim, Não: s.nao, Indecisos: s.indecisos,
      "Conversão atendidos (%)": s.conversao, "Voto/base (%)": s.votoBase, "Não atendeu": s.naoAtendeu,
      Recusou: s.recusou, Inválidos: s.invalidos, Pendentes: s.pendentes, Reagendados: s.reagendados, Inativos: s.inativos,
    }));
    const detail = data.map((r) => ({
      Indicador: r.indicador_nome, Cargo: TIPO_LABEL[r.indicador_tipo] || r.indicador_tipo,
      Região: clean(r.indicador_regiao), Contato: r.nome, Telefone: r.telefone, Cidade: clean(r.cidade), Bairro: clean(r.bairro),
      Campanha: clean(r.campanha_nome), Resultado: r.ultima_ligacao_em ? clean(r.ultimo_status_ligacao) : "pendente",
      "Intenção de voto": voteLabel(r.vota_candidato), "Vota em (se respondeu não)": alternativeCandidate(r),
      Operador: clean(r.operador_nome), Tentativas: r.total_tentativas,
      Situação: r.inativo ? "Inativo" : "Ativo",
      "Inativado em": r.inativado_em ? new Date(r.inativado_em).toLocaleString("pt-BR") : "—",
      "Última ligação": r.ultima_ligacao_em ? new Date(r.ultima_ligacao_em).toLocaleString("pt-BR") : "—",
      "Próxima tentativa": r.proxima_tentativa_em ? new Date(r.proxima_tentativa_em).toLocaleString("pt-BR") : "—",
    }));
    const wsSummary = XLSX.utils.json_to_sheet(resumo);
    const wsDetail = XLSX.utils.json_to_sheet(detail);
    wsSummary["!cols"] = [{ wch: 28 }, { wch: 15 }, { wch: 18 }, ...Array(16).fill({ wch: 16 })];
    wsDetail["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 18 }, { wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 24 }, ...Array(6).fill({ wch: 18 })];
    XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo por indicador");
    XLSX.utils.book_append_sheet(wb, wsDetail, "Contatos detalhados");
    const targetId = indicadorId || indicator;
    const label = individual ? options.indicators.find(([id]) => id === targetId)?.[1] || "indicador" : "geral";
    XLSX.writeFile(wb, `telemarketing-indicadores-${filename(label)}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportPDF = (individual = false, indicadorId?: string) => {
    const data = scopeRows(individual, indicadorId);
    const summary = summarize(data);
    const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
    const targetId = indicadorId || indicator;
    const label = individual ? options.indicators.find(([id]) => id === targetId)?.[1] || "Indicador" : "Geral";
    doc.setFontSize(16); doc.text(`Relatório de resultados — ${label}`, 36, 38);
    doc.setFontSize(9); doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")} | ${filterDescription()}`, 36, 55, { maxWidth: 760 });
    autoTable(doc, {
      startY: 72,
      head: [["Indicador", "Indicados", "Trabalhados", "Atendidos", "Sim", "Não", "Indecisos", "Não atendeu", "Inválidos", "Inativos", "Cobertura", "Conversão"]],
      body: summary.map((s) => [s.nome, s.total, s.trabalhados, s.atendidos, s.sim, s.nao, s.indecisos, s.naoAtendeu, s.invalidos, s.inativos, `${s.cobertura}%`, `${s.conversao}%`]),
      styles: { fontSize: 7 }, headStyles: { fillColor: [30, 64, 52] },
    });
    autoTable(doc, {
      head: [["Indicador", "Contato", "Telefone", "Bairro", "Resultado", "Situação", "Intenção", "Vota em (se não)", "Operador", "Tent.", "Última ligação"]],
      body: data.map((r) => [r.indicador_nome, r.nome, r.telefone, clean(r.bairro), r.ultima_ligacao_em ? clean(r.ultimo_status_ligacao) : "pendente", r.inativo ? "Inativo" : "Ativo", voteLabel(r.vota_candidato), alternativeCandidate(r), clean(r.operador_nome), r.total_tentativas, r.ultima_ligacao_em ? new Date(r.ultima_ligacao_em).toLocaleString("pt-BR") : "—"]),
      styles: { fontSize: 6.5 }, headStyles: { fillColor: [30, 64, 52] }, showHead: "everyPage",
    });
    doc.save(`telemarketing-indicadores-${filename(label)}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const selectedRows = useMemo(
    () => selected ? filtered.filter((r) => r.indicador_id === selected.indicadorId) : [],
    [filtered, selected],
  );
  const citedCandidates = useMemo(() => {
    const grouped = new Map<string, { nome: string; total: number }>();
    selectedRows.filter((r) => r.vota_candidato === "nao" && r.candidato_alternativo?.trim()).forEach((r) => {
      const nome = r.candidato_alternativo!.trim();
      const key = nome.toLocaleLowerCase("pt-BR");
      const current = grouped.get(key);
      grouped.set(key, { nome: current?.nome || nome, total: (current?.total || 0) + 1 });
    });
    return [...grouped.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
  }, [selectedRows]);
  const reactivateContact = async (row: ReportRow) => {
    const { data, error } = await supabase.rpc("tele_reativar_contato" as never, {
      _client_id: clientId, _tabela: "eleicao_indicados", _id: row.contato_id, _reativado_por: "relatorio_indicador",
    } as never);
    if (error) { toast.error(`Erro ao reativar: ${error.message}`); return; }
    const result = data as unknown as { reactivated?: boolean } | null;
    if (!result?.reactivated) { toast.info("Este contato já estava ativo."); return; }
    setRows((current) => current.map((item) => item.contato_id === row.contato_id ? { ...item, inativo: false, inativado_em: null } : item));
    setSelected((current) => current ? { ...current, inativos: Math.max(0, current.inativos - 1) } : current);
    toast.success(`${row.nome} foi reativado e voltou para a fila normal.`);
  };
  const metricCards = totals ? [
    { label: "Indicados", value: totals.total, Icon: Users },
    { label: "Trabalhados", value: totals.trabalhados, Icon: Phone },
    { label: "Tentativas", value: totals.tentativas, Icon: RefreshCw },
    { label: "Atendidos", value: totals.atendidos, Icon: UserCheck },
    { label: "Sim", value: totals.sim, Icon: CheckCircle2 },
    { label: "Não", value: totals.nao, Icon: Vote },
    { label: "Indecisos", value: totals.indecisos, Icon: Vote },
    { label: "Não atendeu", value: totals.naoAtendeu, Icon: Phone },
  ] : [];

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Vote className="size-4 text-primary" />Resultados por indicador</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Indicados → trabalhados → atendidos → votos confirmados, sem nota subjetiva.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void load(true)} disabled={loading}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Atualizar</Button>
            <Button variant="outline" size="sm" onClick={() => exportExcel(false)} disabled={!filtered.length}><FileSpreadsheet className="size-4" />Excel geral</Button>
            <Button variant="outline" size="sm" onClick={() => exportPDF(false)} disabled={!filtered.length}><FileDown className="size-4" />PDF geral</Button>
            <Button size="sm" onClick={() => exportExcel(true)} disabled={indicator === ALL || !filtered.length}><FileSpreadsheet className="size-4" />Excel individual</Button>
            <Button size="sm" onClick={() => exportPDF(true)} disabled={indicator === ALL || !filtered.length}><FileDown className="size-4" />PDF individual</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-4">
          <div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Indicador, contato ou telefone" /></div>
          <Select value={indicator} onValueChange={setIndicator}><SelectTrigger><SelectValue placeholder="Pessoa que indicou" /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos os indicadores</SelectItem>{options.indicators.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select>
          <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos os cargos</SelectItem>{Object.entries(TIPO_LABEL).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select>
          <Select value={campaign} onValueChange={setCampaign}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todas as campanhas</SelectItem>{options.campaigns.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
          <Select value={operator} onValueChange={setOperator}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos os operadores</SelectItem>{options.operators.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
          <Select value={result} onValueChange={setResult}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos os resultados</SelectItem><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="atendeu">Atendeu</SelectItem><SelectItem value="nao_atendeu">Não atendeu</SelectItem><SelectItem value="recusou">Recusou</SelectItem><SelectItem value="numero_invalido">Número inválido</SelectItem></SelectContent></Select>
          <Select value={vote} onValueChange={setVote}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todas as intenções</SelectItem><SelectItem value="sim">Sim</SelectItem><SelectItem value="nao">Não</SelectItem><SelectItem value="indeciso">Indeciso</SelectItem><SelectItem value="sem_resposta">Sem resposta</SelectItem></SelectContent></Select>
          <Select value={region} onValueChange={setRegion}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todas as regiões</SelectItem>{options.regions.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
          <Select value={city} onValueChange={setCity}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todas as cidades</SelectItem>{options.cities.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
          <Select value={neighborhood} onValueChange={setNeighborhood}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos os bairros</SelectItem>{options.neighborhoods.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
          <Input type="date" aria-label="Data inicial" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" aria-label="Data final" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {activeFilters > 0 && <Button variant="ghost" size="sm" onClick={resetFilters}><FilterX className="size-4" />Limpar {activeFilters} filtro(s)</Button>}

        {loading ? <div className="flex justify-center py-12"><Loader2 className="size-7 animate-spin text-primary" /></div> : !totals ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhum resultado encontrado para os filtros selecionados.</p> : <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
            {metricCards.map(({ label, value, Icon }) => <div key={label} className="rounded-md border p-3"><div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground"><Icon className="size-3" />{label}</div><p className="mt-1 text-xl font-bold">{value}</p></div>)}
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            {[
              ["Cobertura da lista", totals.trabalhados, totals.total, totals.cobertura],
              ["Taxa de contato", totals.atendidos, totals.trabalhados, totals.taxaContato],
              ["Conversão dos atendidos", totals.sim, totals.atendidos, totals.conversao],
              ["Voto efetivo na base", totals.sim, totals.total, totals.votoBase],
            ].map(([label, numerator, denominator, value]) => <div key={String(label)} className="rounded-md border p-3"><div className="flex items-center justify-between gap-2 text-xs"><span className="font-medium">{label}</span><strong>{value}%</strong></div><Progress className="mt-2" value={Number(value)} /><p className="mt-1 text-[10px] text-muted-foreground">{numerator} de {denominator}</p></div>)}
          </div>

          <div className="rounded-md border p-4">
            <p className="mb-3 text-sm font-semibold">Funil dos resultados</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[["Indicados", totals.total], ["Trabalhados", totals.trabalhados], ["Atendidos", totals.atendidos], ["Sim", totals.sim]].map(([label, value], index) => <div key={String(label)} className="relative rounded-md bg-muted p-3"><p className="text-xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p>{index < 3 && <span className="absolute -right-2 top-1/2 z-10 -translate-y-1/2 text-muted-foreground">→</span>}</div>)}
            </div>
          </div>

          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader><TableRow><TableHead>Indicador</TableHead>{[["total", "Indicados"], ["trabalhados", "Trab."], ["tentativas", "Tent."], ["atendidos", "Atend."], ["sim", "Sim"], ["nao", "Não"], ["indecisos", "Indec."], ["naoAtendeu", "N/atend."], ["invalidos", "Invál."], ["cobertura", "Cobert."], ["conversao", "Conversão"]].map(([key, label]) => <TableHead key={key} className="text-center"><Button variant="ghost" size="sm" className="h-auto px-1 text-xs" onClick={() => setSort(key as keyof Summary)}>{label}<ArrowDownUp className="size-3" /></Button></TableHead>)}</TableRow></TableHeader>
              <TableBody>{summaries.map((s) => <TableRow key={s.indicadorId} className="cursor-pointer" onClick={() => setSelected(s)}><TableCell><button type="button" className="text-left font-medium text-primary hover:underline" onClick={() => setSelected(s)}>{s.nome}</button><p className="text-[10px] text-muted-foreground">{TIPO_LABEL[s.tipo] || s.tipo} · {s.regiao}</p></TableCell><TableCell className="text-center">{s.total}</TableCell><TableCell className="text-center">{s.trabalhados}</TableCell><TableCell className="text-center">{s.tentativas}</TableCell><TableCell className="text-center">{s.atendidos}</TableCell><TableCell className="text-center font-semibold text-emerald-600">{s.sim}</TableCell><TableCell className="text-center text-destructive">{s.nao}</TableCell><TableCell className="text-center">{s.indecisos}</TableCell><TableCell className="text-center">{s.naoAtendeu}</TableCell><TableCell className="text-center">{s.invalidos}</TableCell><TableCell className="text-center">{s.cobertura}%</TableCell><TableCell className="text-center font-semibold">{s.conversao}%</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
        </>}
      </CardContent>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
              <div><DialogTitle>{selected?.nome} — relatório individual</DialogTitle>{selected && <p className="mt-1 text-xs text-muted-foreground">{TIPO_LABEL[selected.tipo] || selected.tipo} · {selected.regiao}</p>}</div>
              {selected && <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => exportExcel(true, selected.indicadorId)}><FileSpreadsheet className="size-4" />Excel</Button><Button variant="outline" size="sm" onClick={() => exportPDF(true, selected.indicadorId)}><FileDown className="size-4" />PDF</Button></div>}
            </div>
          </DialogHeader>
          {selected && <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 md:grid-cols-9">{[["Indicados", selected.total], ["Trabalhados", selected.trabalhados], ["Atendidos", selected.atendidos], ["Sim", selected.sim], ["Não", selected.nao], ["Indecisos", selected.indecisos], ["Não atendeu", selected.naoAtendeu], ["Inválidos", selected.invalidos], ["Inativos", selected.inativos]].map(([label, value]) => <div key={String(label)} className="rounded-md border p-2 text-center"><p className="text-lg font-bold">{value}</p><p className="text-[10px] text-muted-foreground">{label}</p></div>)}</div>
            {selected.nao > 0 && <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20"><p className="text-xs font-semibold">Candidatos citados por quem respondeu “Não”</p>{citedCandidates.length ? <div className="mt-2 flex flex-wrap gap-2">{citedCandidates.map((item) => <Badge key={item.nome} variant="outline" className="bg-background">{item.nome} <span className="ml-1 text-muted-foreground">({item.total})</span></Badge>)}</div> : <p className="mt-1 text-xs text-muted-foreground">Nenhum candidato alternativo foi informado.</p>}</div>}
            <div className="max-h-[58vh] overflow-auto rounded-md border"><Table><TableHeader className="sticky top-0 z-10 bg-background"><TableRow><TableHead>Contato</TableHead><TableHead>Telefone</TableHead><TableHead>Bairro/cidade</TableHead><TableHead>Resultado</TableHead><TableHead>Situação</TableHead><TableHead>Intenção</TableHead><TableHead>Disse que vota em</TableHead><TableHead>Operador</TableHead><TableHead>Tent.</TableHead><TableHead>Última ligação</TableHead><TableHead>Ação</TableHead></TableRow></TableHeader><TableBody>{selectedRows.map((r) => <TableRow key={r.contato_id}><TableCell className="font-medium">{r.nome}</TableCell><TableCell>{r.telefone}</TableCell><TableCell>{clean(r.bairro)} / {clean(r.cidade)}</TableCell><TableCell><Badge variant="outline">{r.ultima_ligacao_em ? RESULT_LABEL[r.ultimo_status_ligacao || ""] || clean(r.ultimo_status_ligacao) : "Pendente"}</Badge></TableCell><TableCell>{r.inativo ? <Badge variant="secondary">Inativo</Badge> : <Badge variant="outline">Ativo</Badge>}</TableCell><TableCell><Badge variant={r.vota_candidato === "nao" ? "destructive" : "outline"}>{voteLabel(r.vota_candidato)}</Badge></TableCell><TableCell className={r.vota_candidato === "nao" ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground"}>{alternativeCandidate(r)}</TableCell><TableCell>{clean(r.operador_nome)}</TableCell><TableCell className="text-center">{r.total_tentativas}</TableCell><TableCell>{r.ultima_ligacao_em ? new Date(r.ultima_ligacao_em).toLocaleString("pt-BR") : "—"}</TableCell><TableCell>{r.inativo ? <Button variant="outline" size="sm" onClick={() => void reactivateContact(r)}><RefreshCw className="size-3" />Reativar</Button> : "—"}</TableCell></TableRow>)}</TableBody></Table></div>
          </div>}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
