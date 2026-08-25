import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertTriangle, ArrowDown, ArrowUp, FileDown, Gauge, ListChecks, Megaphone,
  Plus, RefreshCw, Search, Settings2, Target, Trash2, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  fetchGrupos, fetchPendencias, fetchPrevia, type PreviaPublico, type PublicoGrupo,
  atualizarMissaoMonitoramento, casarInteracoes, excluirRegra, fetchAdesao, fetchHistoricoPessoa,
  fetchMissoes, fetchMonitorOverview, fetchRanking, fetchRegras, gerarObrigacoes, recalcularIndices,
  registrarCobranca, salvarRegra, dispensarObrigacao,
  EVIDENCIA_LABEL, FAIXA_META, STATUS_LABEL, TIPO_OBRIGACAO_LABEL,
  type AdesaoRow, type HistoricoRow, type MissaoMonitorada, type MonitorOverview,
  type RankingRow, type Regra,
} from "@/lib/engagement-monitor";


const CARGOS = ["coordenador", "lider", "cabo", "contratado", "funcionario", "portal", "apoiador"];

const cap = (s?: string | null) => (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const fmtPhone = (s?: string | null) => {
  const d = (s || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || "—";
};

export default function MonitoramentoTab({ clientId, clientName }: { clientId: string; clientName?: string }) {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<MonitorOverview | null>(null);
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [adesao, setAdesao] = useState<AdesaoRow[]>([]);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [missoes, setMissoes] = useState<MissaoMonitorada[]>([]);
  const [busy, setBusy] = useState(false);
  const [dias, setDias] = useState(30);

  const [busca, setBusca] = useState("");
  const [cargoFilter, setCargoFilter] = useState("todos");
  const [faixaFilter, setFaixaFilter] = useState("todos");

  const [pessoa, setPessoa] = useState<RankingRow | null>(null);
  const [historico, setHistorico] = useState<HistoricoRow[]>([]);
  const [cobrancaTexto, setCobrancaTexto] = useState("");

  const [regraEdit, setRegraEdit] = useState<Partial<Regra> | null>(null);
  const [missaoEdit, setMissaoEdit] = useState<MissaoMonitorada | null>(null);
  const [grupos, setGrupos] = useState<PublicoGrupo[]>([]);
  const [previaPublico, setPreviaPublico] = useState<PreviaPublico | null>(null);
  const [semProva, setSemProva] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const [o, r, a, g, m, gr] = await Promise.all([
        fetchMonitorOverview(clientId),
        fetchRanking(clientId),
        fetchAdesao(clientId),
        fetchRegras(clientId),
        fetchMissoes(clientId),
        fetchGrupos(clientId),
      ]);
      setGrupos(gr);
      try {
        const pend = await fetchPendencias(clientId, null);
        setSemProva(new Set(pend.filter((x) => x.sem_prova).map((x) => `${x.origem}:${x.ref_id}`)));
      } catch {
        setSemProva(new Set());
      }
      setOverview(o);
      setRanking(r);
      setAdesao(a);
      setRegras(g);
      setMissoes(m);
    } catch (e) {
      toast.error("Erro ao carregar monitoramento: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clientId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const sincronizar = async () => {
    setBusy(true);
    try {
      const res = await casarInteracoes(clientId);
      const n = await recalcularIndices(clientId, dias);
      toast.success(`${res.atualizadas} interações confirmadas · ${res.nao_cumpridas} vencidas · ${n} índices atualizados`);
      await load();
    } catch (e) {
      toast.error("Erro ao sincronizar: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cargos = useMemo(
    () => Array.from(new Set(ranking.map((r) => r.cargo).filter(Boolean) as string[])).sort(),
    [ranking],
  );

  const filtered = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return ranking.filter((r) => {
      if (term && !(r.nome || "").toLowerCase().includes(term) && !(r.telefone || "").includes(term)) return false;
      if (cargoFilter !== "todos" && r.cargo !== cargoFilter) return false;
      if (faixaFilter !== "todos" && r.faixa !== faixaFilter) return false;
      return true;
    });
  }, [ranking, busca, cargoFilter, faixaFilter]);

  const abrirPessoa = async (row: RankingRow) => {
    setPessoa(row);
    setCobrancaTexto(
      `Olá ${row.nome.split(" ")[0]}! Seu índice de engajamento está em ${row.indice}. ` +
        `Você tem ${row.nao_cumpridas} publicação(ões) sem interação. Pode dar uma força nas próximas?`,
    );
    setHistorico([]);
    try {
      setHistorico(await fetchHistoricoPessoa(clientId, row.origem, row.ref_id));
    } catch (e) {
      toast.error("Erro ao carregar histórico: " + (e as Error).message);
    }
  };

  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const rows = filtered.map((r) => ({
      Nome: r.nome,
      Cargo: cap(r.cargo),
      Telefone: fmtPhone(r.telefone),
      Região: cap(r.regiao || r.cidade),
      Obrigações: r.obrigacoes,
      Cumpridas: r.cumpridas,
      "Não cumpridas": r.nao_cumpridas,
      "Cumprimento %": r.cumprimento,
      "Qualidade %": r.qualidade,
      "Regularidade %": r.regularidade,
      "Pontualidade %": r.pontualidade,
      Índice: r.indice,
      Faixa: FAIXA_META[r.faixa]?.label ?? r.faixa,
      Variação: r.variacao ?? "",
      "Última interação": fmtDate(r.ultima_interacao),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Monitoramento");
    XLSX.writeFile(wb, `monitoramento-engajamento-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportarPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text("Monitoramento de Engajamento", 14, 14);
    doc.setFontSize(9);
    doc.text(`${clientName || ""} · gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 20);
    autoTable(doc, {
      startY: 26,
      styles: { fontSize: 8 },
      head: [["Nome", "Cargo", "Telefone", "Região", "Obrig.", "Cumpr.", "Faltas", "Cumpr.%", "Índice", "Faixa"]],
      body: filtered.map((r) => [
        r.nome, cap(r.cargo), fmtPhone(r.telefone), cap(r.regiao || r.cidade),
        r.obrigacoes, r.cumpridas, r.nao_cumpridas, `${r.cumprimento}%`, r.indice,
        FAIXA_META[r.faixa]?.label ?? r.faixa,
      ]),
    });
    doc.save(`monitoramento-engajamento-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const salvarRegraAtual = async () => {
    if (!regraEdit?.nome?.trim()) return toast.error("Informe o nome da regra");
    try {
      await salvarRegra(clientId, regraEdit);
      toast.success("Regra salva");
      setRegraEdit(null);
      setRegras(await fetchRegras(clientId));
    } catch (e) {
      toast.error("Erro ao salvar regra: " + (e as Error).message);
    }
  };

  useEffect(() => {
    const regra = regras.find((r) => r.id === missaoEdit?.regra_id);
    if (!missaoEdit || !regra) { setPreviaPublico(null); return; }
    let cancel = false;
    fetchPrevia(clientId, regra.id, regra.grupo_id)
      .then((p) => { if (!cancel) setPreviaPublico(p); })
      .catch(() => { if (!cancel) setPreviaPublico(null); });

    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missaoEdit?.regra_id, regras, clientId]);

  const salvarMissaoAtual = async () => {
    if (!missaoEdit) return;
    try {
      await atualizarMissaoMonitoramento(missaoEdit.id, {
        regra_id: missaoEdit.regra_id,
        prazo_horas: missaoEdit.prazo_horas,
        publicado_em: missaoEdit.publicado_em,
        post_id_facebook: missaoEdit.post_id_facebook,
        post_id_instagram: missaoEdit.post_id_instagram,
      });
      const n = await gerarObrigacoes(clientId, missaoEdit.id, missaoEdit.regra_id);
      await casarInteracoes(clientId, missaoEdit.id);
      toast.success(`${n} obrigações geradas para esta publicação`);
      setMissaoEdit(null);
      await load();
    } catch (e) {
      toast.error("Erro ao monitorar publicação: " + (e as Error).message);
    }
  };

  const cobrar = async () => {
    if (!pessoa) return;
    try {
      await registrarCobranca(clientId, pessoa.origem, pessoa.ref_id, "whatsapp", cobrancaTexto);
      const phone = (pessoa.telefone || "").replace(/\D/g, "");
      if (phone) {
        const { toWhatsAppBR } = await import("@/lib/phone-utils");
        window.open(`https://wa.me/${toWhatsAppBR(pessoa.telefone || "")}?text=${encodeURIComponent(cobrancaTexto)}`, "_blank");
      }
      toast.success("Cobrança registrada");
    } catch (e) {
      toast.error("Erro ao registrar cobrança: " + (e as Error).message);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="px-3 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4 text-primary" /> Monitoramento de contratados
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Cada publicação monitorada gera uma <strong>obrigação por pessoa</strong> conforme a regra escolhida. O
            sistema confirma o cumprimento por níveis de evidência: <strong>E1</strong> comentário capturado pela API ou
            clique no link rastreado, <strong>E2</strong> conclusão declarada no portal, <strong>E3</strong> evidência
            anexada e validada. O índice (0–100) pesa cumprimento 50%, qualidade 20%, regularidade 15%, pontualidade 10%
            e tendência 5%.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3 px-3 sm:px-6">
          <div className="space-y-1">
            <Label className="text-xs">Período do índice</Label>
            <Select value={String(dias)} onValueChange={(v) => setDias(Number(v))}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="15">15 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="60">60 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={sincronizar} disabled={busy} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Sincronizar e recalcular
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Índice médio</p>
          <p className="text-2xl font-bold">{overview?.indice_medio ?? 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Cumprimento geral</p>
          <p className="text-2xl font-bold">{overview?.cumprimento_geral ?? 0}%</p>
          <p className="text-[11px] text-muted-foreground">{overview?.cumpridas ?? 0} de {overview?.obrigacoes ?? 0} obrigações</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Publicações monitoradas</p>
          <p className="text-2xl font-bold">{overview?.publicacoes_monitoradas ?? 0}</p>
          <p className="text-[11px] text-muted-foreground">{overview?.total_pessoas ?? 0} pessoas cobradas</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Em risco</p>
          <p className="text-2xl font-bold text-destructive">{(overview?.baixo ?? 0) + (overview?.critico ?? 0)}</p>
          <p className="text-[11px] text-muted-foreground">
            {overview?.excelente ?? 0} excelentes · {overview?.atencao ?? 0} em atenção
          </p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="ranking" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ranking" className="gap-1.5 text-xs sm:text-sm"><TrendingUp className="h-4 w-4" /> Ranking</TabsTrigger>
          <TabsTrigger value="publicacoes" className="gap-1.5 text-xs sm:text-sm"><Megaphone className="h-4 w-4" /> Publicações</TabsTrigger>
          <TabsTrigger value="regras" className="gap-1.5 text-xs sm:text-sm"><Target className="h-4 w-4" /> Regras</TabsTrigger>
          
        </TabsList>

        <TabsContent value="ranking">
          <Card>
            <CardHeader className="px-3 sm:px-6">
              <CardTitle className="text-base">Desempenho individual</CardTitle>
              <CardDescription className="text-xs">
                Clique em uma pessoa para ver o histórico publicação por publicação e cobrar pelo WhatsApp.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-3 sm:px-6">
              <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
                </div>
                <Select value={cargoFilter} onValueChange={setCargoFilter}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Cargo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os cargos</SelectItem>
                    {cargos.map((c) => <SelectItem key={c} value={c}>{cap(c)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={faixaFilter} onValueChange={setFaixaFilter}>
                  <SelectTrigger className="w-[150px]"><SelectValue placeholder="Faixa" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas as faixas</SelectItem>
                    {Object.entries(FAIXA_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" className="gap-2" onClick={exportarExcel}><FileDown className="h-4 w-4" /> Excel</Button>
                <Button variant="outline" className="gap-2" onClick={exportarPdf}><FileDown className="h-4 w-4" /> PDF</Button>
              </div>

              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead className="text-center">Obrig.</TableHead>
                      <TableHead className="text-center">Cumpridas</TableHead>
                      <TableHead className="text-center">Faltas</TableHead>
                      <TableHead className="text-center">Cumpr.</TableHead>
                      <TableHead className="text-center">Índice</TableHead>
                      <TableHead className="text-center">Evolução</TableHead>
                      <TableHead>Faixa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 && (
                      <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                        Nenhum dado ainda. Marque publicações como monitoradas e clique em “Sincronizar e recalcular”.
                      </TableCell></TableRow>
                    )}
                    {filtered.map((r) => (
                      <TableRow key={`${r.origem}-${r.ref_id}`} className="cursor-pointer" onClick={() => abrirPessoa(r)}>
                        <TableCell>
                          <div className="font-medium flex items-center gap-1.5">
                            {r.nome}
                            {semProva.has(`${r.origem}:${r.ref_id}`) && (
                              <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
                                sem cadastro p/ comprovar
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{fmtPhone(r.telefone)} · {cap(r.regiao || r.cidade) || "—"}</div>
                        </TableCell>
                        <TableCell className="text-xs">{cap(r.cargo)}</TableCell>
                        <TableCell className="text-center">{r.obrigacoes}</TableCell>
                        <TableCell className="text-center text-emerald-600">{r.cumpridas}</TableCell>
                        <TableCell className="text-center text-destructive">{r.nao_cumpridas}</TableCell>
                        <TableCell className="text-center">{r.cumprimento}%</TableCell>
                        <TableCell className="text-center font-semibold">{r.indice}</TableCell>
                        <TableCell className="text-center text-xs">
                          {r.variacao == null ? "—" : (
                            <span className={r.variacao >= 0 ? "text-emerald-600" : "text-destructive"}>
                              {r.variacao >= 0 ? <ArrowUp className="inline h-3 w-3" /> : <ArrowDown className="inline h-3 w-3" />}
                              {Math.abs(r.variacao)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={FAIXA_META[r.faixa]?.className}>{FAIXA_META[r.faixa]?.label ?? r.faixa}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="publicacoes">
          <Card>
            <CardHeader className="px-3 sm:px-6">
              <CardTitle className="text-base">Adesão por publicação</CardTitle>
              <CardDescription className="text-xs">
                Configure a regra, o prazo e os IDs do post (Facebook/Instagram) para que os comentários capturados pela
                API sejam casados automaticamente com as obrigações.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-3 sm:px-6">
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Publicação</TableHead>
                      <TableHead className="text-center">Obrig.</TableHead>
                      <TableHead className="text-center">Cumpridas</TableHead>
                      <TableHead className="text-center">Pendentes</TableHead>
                      <TableHead className="text-center">Faltas</TableHead>
                      <TableHead className="text-center">Adesão</TableHead>
                      <TableHead>Prazo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adesao.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center py-6 text-sm text-muted-foreground">
                        Nenhuma publicação monitorada ainda.
                      </TableCell></TableRow>
                    )}
                    {adesao.map((a) => (
                      <TableRow key={a.mission_id}>
                        <TableCell>
                          <div className="font-medium text-sm">{a.titulo || "Publicação"}</div>
                          <div className="text-xs text-muted-foreground">{cap(a.plataforma)} · {fmtDate(a.publicado_em)}</div>
                        </TableCell>
                        <TableCell className="text-center">{a.obrigacoes}</TableCell>
                        <TableCell className="text-center text-emerald-600">{a.cumpridas}</TableCell>
                        <TableCell className="text-center">{a.pendentes}</TableCell>
                        <TableCell className="text-center text-destructive">{a.nao_cumpridas}</TableCell>
                        <TableCell className="text-center font-semibold">{a.adesao}%</TableCell>
                        <TableCell className="text-xs">{fmtDate(a.prazo_em)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Publicações do portal</p>
                <div className="rounded-md border divide-y">
                  {missoes.map((m) => (
                    <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{m.title || m.post_url || "Publicação"}</div>
                        <div className="text-xs text-muted-foreground">
                          {cap(m.platform)} · {fmtDate(m.publicado_em || m.created_at)}
                          {m.monitorada && <Badge variant="outline" className="ml-2 bg-primary/10 text-primary border-primary/30">Monitorada</Badge>}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="gap-2" onClick={() => setMissaoEdit(m)}>
                        <Settings2 className="h-4 w-4" /> {m.monitorada ? "Ajustar" : "Monitorar"}
                      </Button>
                    </div>
                  ))}
                  {missoes.length === 0 && (
                    <p className="p-4 text-sm text-muted-foreground">
                      Nenhuma publicação cadastrada no portal de missões.
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="regras">
          <Card>
            <CardHeader className="flex-row items-center justify-between px-3 sm:px-6">
              <div>
                <CardTitle className="text-base">Regras de obrigação</CardTitle>
                <CardDescription className="text-xs">
                  Defina quem deve interagir (cargos, regiões e cidades), o que é exigido e em quanto tempo.
                </CardDescription>
              </div>
              <Button size="sm" className="gap-2" onClick={() => setRegraEdit({ tipo_obrigacao: "interagir", esperado: 1, prazo_horas: 48, ativo: true, cargos: [], regioes: [], cidades: [] })}>
                <Plus className="h-4 w-4" /> Nova regra
              </Button>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <div className="rounded-md border divide-y">
                {regras.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhuma regra criada.</p>}
                {regras.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div>
                      <div className="text-sm font-medium flex items-center gap-2">
                        {r.nome}
                        {!r.ativo && <Badge variant="outline" className="text-muted-foreground">Inativa</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {TIPO_OBRIGACAO_LABEL[r.tipo_obrigacao]} · prazo {r.prazo_horas}h ·{" "}
                        {r.cargos.length ? r.cargos.map(cap).join(", ") : "todos os cargos"}
                        {r.regioes.length ? ` · ${r.regioes.length} região(ões)` : ""}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setRegraEdit(r)}>Editar</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => {
                        try { await excluirRegra(r.id); setRegras(await fetchRegras(clientId)); toast.success("Regra excluída"); }
                        catch (e) { toast.error((e as Error).message); }
                      }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Regra dialog */}
      <Dialog open={!!regraEdit} onOpenChange={(o) => !o && setRegraEdit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{regraEdit?.id ? "Editar regra" : "Nova regra de obrigação"}</DialogTitle>
            <DialogDescription className="text-xs">
              A regra define o público cobrado e o tipo de prova exigida em cada publicação monitorada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input value={regraEdit?.nome || ""} onChange={(e) => setRegraEdit({ ...regraEdit, nome: e.target.value })} placeholder="Ex.: Coordenadores — comentar em 24h" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tipo de obrigação</Label>
                <Select value={regraEdit?.tipo_obrigacao || "interagir"} onValueChange={(v) => setRegraEdit({ ...regraEdit, tipo_obrigacao: v as Regra["tipo_obrigacao"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPO_OBRIGACAO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Prazo (horas)</Label>
                <Input type="number" min={1} value={regraEdit?.prazo_horas ?? 48} onChange={(e) => setRegraEdit({ ...regraEdit, prazo_horas: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Como montar o público</Label>
                <Select value={regraEdit?.modo_publico || "automatico"} onValueChange={(v) => setRegraEdit({ ...regraEdit, modo_publico: v as Regra["modo_publico"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="automatico">Automático (cargo/região)</SelectItem>
                    <SelectItem value="manual">Lista manual (grupo)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Grupo</Label>
                <Select value={regraEdit?.grupo_id || ""} onValueChange={(v) => setRegraEdit({ ...regraEdit, grupo_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    {grupos.map((g) => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}
                    {grupos.length === 0 && <SelectItem value="" disabled>Crie um grupo em “Público monitorado”</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cargos cobrados (vazio = todos) — usados no modo automático</Label>
              <div className="flex flex-wrap gap-2">
                {CARGOS.map((c) => {
                  const on = (regraEdit?.cargos || []).includes(c);
                  return (
                    <Badge key={c} variant="outline" className={`cursor-pointer ${on ? "bg-primary/15 text-primary border-primary/30" : ""}`}
                      onClick={() => setRegraEdit({
                        ...regraEdit,
                        cargos: on ? (regraEdit?.cargos || []).filter((x) => x !== c) : [...(regraEdit?.cargos || []), c],
                      })}>
                      {cap(c)}
                    </Badge>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Regiões (separadas por vírgula, vazio = todas)</Label>
              <Input value={(regraEdit?.regioes || []).join(", ")} onChange={(e) => setRegraEdit({ ...regraEdit, regioes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cidades (separadas por vírgula, vazio = todas)</Label>
              <Input value={(regraEdit?.cidades || []).join(", ")} onChange={(e) => setRegraEdit({ ...regraEdit, cidades: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={regraEdit?.ativo ?? true} onCheckedChange={(v) => setRegraEdit({ ...regraEdit, ativo: v })} />
              <Label className="text-xs">Regra ativa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegraEdit(null)}>Cancelar</Button>
            <Button onClick={salvarRegraAtual}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Missão dialog */}
      <Dialog open={!!missaoEdit} onOpenChange={(o) => !o && setMissaoEdit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Monitorar publicação</DialogTitle>
            <DialogDescription className="text-xs">
              Ao salvar, o sistema cria uma obrigação para cada pessoa do público da regra e já tenta casar as
              interações existentes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Regra aplicada</Label>
              <Select value={missaoEdit?.regra_id || ""} onValueChange={(v) => setMissaoEdit(missaoEdit ? { ...missaoEdit, regra_id: v } : null)}>
                <SelectTrigger><SelectValue placeholder="Selecione a regra" /></SelectTrigger>
                <SelectContent>
                  {regras.filter((r) => r.ativo).map((r) => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Prazo (horas)</Label>
                <Input type="number" min={1} value={missaoEdit?.prazo_horas ?? ""} placeholder="usa o da regra"
                  onChange={(e) => setMissaoEdit(missaoEdit ? { ...missaoEdit, prazo_horas: e.target.value ? Number(e.target.value) : null } : null)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Publicado em</Label>
                <Input type="datetime-local"
                  value={missaoEdit?.publicado_em ? new Date(missaoEdit.publicado_em).toISOString().slice(0, 16) : ""}
                  onChange={(e) => setMissaoEdit(missaoEdit ? { ...missaoEdit, publicado_em: e.target.value ? new Date(e.target.value).toISOString() : null } : null)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ID do post no Facebook (opcional)</Label>
              <Input value={missaoEdit?.post_id_facebook || ""} onChange={(e) => setMissaoEdit(missaoEdit ? { ...missaoEdit, post_id_facebook: e.target.value || null } : null)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ID do post no Instagram (opcional)</Label>
              <Input value={missaoEdit?.post_id_instagram || ""} onChange={(e) => setMissaoEdit(missaoEdit ? { ...missaoEdit, post_id_instagram: e.target.value || null } : null)} />
            </div>
            {previaPublico !== null && (
              <div className="text-xs rounded-md border bg-muted/40 p-2 space-y-1">
                <p>
                  <strong>{previaPublico.total}</strong> pessoa(s) no público desta regra —{" "}
                  <strong className="text-emerald-600">{previaPublico.prontas}</strong> serão cobradas.
                </p>
                {previaPublico.sem_dados > 0 && (
                  <p className="text-destructive">
                    {previaPublico.sem_dados} ficam de fora por falta de cadastro ({previaPublico.sem_rede} sem rede
                    social, {previaPublico.sem_telefone} sem telefone). Resolva em “Público monitorado → Faltam dados”.
                  </p>
                )}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground flex gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              Sem o ID do post, o cumprimento por comentário não pode ser comprovado — restam o clique no link
              rastreado (E1) e a conclusão declarada no portal (E2).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMissaoEdit(null)}>Cancelar</Button>
            <Button onClick={salvarMissaoAtual} className="gap-2"><ListChecks className="h-4 w-4" /> Salvar e gerar obrigações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pessoa dialog */}
      <Dialog open={!!pessoa} onOpenChange={(o) => !o && setPessoa(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{pessoa?.nome}</DialogTitle>
            <DialogDescription className="text-xs">
              {cap(pessoa?.cargo)} · {fmtPhone(pessoa?.telefone)} · índice {pessoa?.indice} ({FAIXA_META[pessoa?.faixa ?? "critico"]?.label})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                ["Cumprimento", pessoa?.cumprimento],
                ["Qualidade", pessoa?.qualidade],
                ["Regularidade", pessoa?.regularidade],
                ["Pontualidade", pessoa?.pontualidade],
              ].map(([l, v]) => (
                <div key={String(l)} className="rounded-md border p-2">
                  <p className="text-[11px] text-muted-foreground">{l}</p>
                  <p className="text-sm font-semibold">{v ?? 0}%</p>
                </div>
              ))}
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Publicação</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Evidência</TableHead>
                    <TableHead className="text-center">Pontos</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historico.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">Sem obrigações registradas.</TableCell></TableRow>
                  )}
                  {historico.map((h) => (
                    <TableRow key={h.obrigacao_id}>
                      <TableCell>
                        <div className="text-sm">{h.titulo || "Publicação"}</div>
                        <div className="text-[11px] text-muted-foreground">Prazo {fmtDate(h.prazo_em)}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {STATUS_LABEL[h.status] ?? h.status}
                        {h.atraso_horas ? <span className="text-amber-600"> (+{h.atraso_horas}h)</span> : null}
                      </TableCell>
                      <TableCell className="text-xs">{h.evidencia_nivel ? EVIDENCIA_LABEL[h.evidencia_nivel] : "—"}</TableCell>
                      <TableCell className="text-center text-xs">{h.pontos}</TableCell>
                      <TableCell className="text-right">
                        {h.status !== "dispensada" && h.status !== "cumprida" && (
                          <Button size="sm" variant="ghost" className="text-xs" onClick={async () => {
                            try {
                              await dispensarObrigacao(h.obrigacao_id, "Dispensada pelo gestor");
                              if (pessoa) setHistorico(await fetchHistoricoPessoa(clientId, pessoa.origem, pessoa.ref_id));
                              toast.success("Obrigação dispensada");
                            } catch (e) { toast.error((e as Error).message); }
                          }}>Dispensar</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Mensagem de cobrança</Label>
              <Textarea rows={3} value={cobrancaTexto} onChange={(e) => setCobrancaTexto(e.target.value)} />
              <Button size="sm" onClick={cobrar} className="gap-2"><Megaphone className="h-4 w-4" /> Registrar e abrir WhatsApp</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
