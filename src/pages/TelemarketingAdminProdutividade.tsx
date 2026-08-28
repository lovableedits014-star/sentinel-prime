import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, CheckCircle2, Download, Loader2, Phone, RotateCcw, Search, Target, UserCheck, Users, type LucideIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import TelemarketingSubNav from "@/components/telemarketing/TelemarketingSubNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveClientId } from "@/hooks/useActiveClientId";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type CallRow = {
  id: string; operador_id: string | null; operador_nome: string; created_at: string;
  ligacao_status: string; vota_candidato: string | null; tabela: string;
  contato_id: string; campanha_id: string | null; cidade: string | null;
  bairro: string | null; proxima_tentativa_em: string | null;
};

type OperatorMetric = {
  key: string; nome: string; tentativas: number; contatos: number; atendidas: number;
  naoAtendidas: number; reagendadas: number; invalidos: number; conversoes: number;
  indecisos: number; retornosVencidos: number; primeira: string; ultima: string;
  taxaAtendimento: number; taxaConversao: number;
};

const ALL = "__all__";
const pad = (n: number) => String(n).padStart(2, "0");
const dateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const operatorKey = (r: CallRow) => r.operador_id || `nome:${r.operador_nome.trim().toLocaleLowerCase("pt-BR")}`;
const pct = (a: number, b: number) => b ? Math.round((a / b) * 1000) / 10 : 0;
const fmtDateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const statusLabel: Record<string, string> = {
  atendeu: "Atendeu", nao_atendeu: "Não atendeu", reagendou: "Reagendou",
  invalido: "Inválido", recusou: "Recusou", pendente: "Pendente",
};
const PRODUCTIVITY_PAGE_SIZE = 1000;

function buildMetric(key: string, rows: CallRow[]): OperatorMetric {
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const latestByContact = new Map<string, CallRow>();
  rows.forEach((r) => {
    const contactKey = `${r.tabela}:${r.contato_id}`;
    const current = latestByContact.get(contactKey);
    if (!current || current.created_at < r.created_at) latestByContact.set(contactKey, r);
  });
  const atendidas = rows.filter((r) => r.ligacao_status === "atendeu").length;
  const conversoes = rows.filter((r) => r.ligacao_status === "atendeu" && r.vota_candidato === "sim").length;
  return {
    key, nome: sorted[0]?.operador_nome || "Operador", tentativas: rows.length,
    contatos: new Set(rows.map((r) => `${r.tabela}:${r.contato_id}`)).size,
    atendidas, naoAtendidas: rows.filter((r) => r.ligacao_status === "nao_atendeu").length,
    reagendadas: rows.filter((r) => r.ligacao_status === "reagendou").length,
    invalidos: rows.filter((r) => r.ligacao_status === "invalido").length,
    conversoes, indecisos: rows.filter((r) => r.vota_candidato === "indeciso").length,
    retornosVencidos: [...latestByContact.values()].filter((r) => r.proxima_tentativa_em && new Date(r.proxima_tentativa_em) < new Date()).length,
    primeira: sorted[0]?.created_at || "", ultima: sorted.at(-1)?.created_at || "",
    taxaAtendimento: pct(atendidas, rows.length), taxaConversao: pct(conversoes, atendidas),
  };
}

function escapeCsv(value: unknown) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }

export default function TelemarketingAdminProdutividade() {
  const { clientId, isLoading: loadingClient, needsClientSelection } = useActiveClientId();
  const today = useMemo(startOfToday, []);
  const [inicio, setInicio] = useState(dateInput(today));
  const [fim, setFim] = useState(dateInput(today));
  const [campanha, setCampanha] = useState(ALL);
  const [operador, setOperador] = useState(ALL);
  const [busca, setBusca] = useState("");
  const [rows, setRows] = useState<CallRow[]>([]);
  const [filas, setFilas] = useState<{ id: string; nome: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    const from = new Date(`${inicio}T00:00:00`);
    const to = new Date(`${fim}T00:00:00`); to.setDate(to.getDate() + 1);
    if (to <= from) { toast.error("A data final deve ser igual ou posterior à inicial."); return; }
    setLoading(true);
    try {
      const allRows: CallRow[] = [];
      let page = 0;

      // O PostgREST limita cada resposta a 1.000 registros. Percorremos todas
      // as páginas para que cartões, gráfico, auditoria e CSV usem o total real.
      while (true) {
        const start = page * PRODUCTIVITY_PAGE_SIZE;
        const end = start + PRODUCTIVITY_PAGE_SIZE - 1;
        const { data, error } = await (supabase.rpc("tele_produtividade_ligacoes" as never, {
          _client_id: clientId,
          _inicio: from.toISOString(),
          _fim: to.toISOString(),
          _campanha_id: campanha === ALL ? null : campanha,
        } as never) as any)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(start, end);

        if (error) throw error;
        const batch = ((data as unknown[]) || []) as CallRow[];
        allRows.push(...batch);
        if (batch.length < PRODUCTIVITY_PAGE_SIZE) break;
        page += 1;
      }

      setRows(allRows);
    } catch (error: any) {
      toast.error(`Não foi possível carregar a produtividade: ${error?.message || "erro desconhecido"}`);
    } finally {
      setLoading(false);
    }
  }, [campanha, clientId, fim, inicio]);

  useEffect(() => {
    if (!clientId) return;
    void supabase.rpc("tele_fila_summary" as never, { _client_id: clientId } as never).then(({ data }) => {
      setFilas(((data as unknown as { campanha_id: string; nome: string }[]) || []).map((r) => ({ id: r.campanha_id, nome: r.nome })));
    });
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  const metrics = useMemo(() => {
    const grouped = new Map<string, CallRow[]>();
    rows.forEach((r) => { const key = operatorKey(r); grouped.set(key, [...(grouped.get(key) || []), r]); });
    return [...grouped.entries()].map(([key, calls]) => buildMetric(key, calls)).sort((a, b) => b.tentativas - a.tentativas);
  }, [rows]);

  const visibleMetrics = useMemo(() => metrics.filter((m) =>
    (operador === ALL || m.key === operador) && m.nome.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR"))),
  [metrics, operador, busca]);
  const visibleKeys = useMemo(() => new Set(visibleMetrics.map((m) => m.key)), [visibleMetrics]);
  const filteredRows = useMemo(() => rows.filter((r) => visibleKeys.has(operatorKey(r))), [rows, visibleKeys]);
  const selectedRows = useMemo(() => selected ? rows.filter((r) => operatorKey(r) === selected) : [], [rows, selected]);

  const totals = useMemo(() => {
    const atendidas = filteredRows.filter((r) => r.ligacao_status === "atendeu").length;
    const conversoes = filteredRows.filter((r) => r.ligacao_status === "atendeu" && r.vota_candidato === "sim").length;
    return { tentativas: filteredRows.length, contatos: new Set(filteredRows.map((r) => `${r.tabela}:${r.contato_id}`)).size,
      atendidas, conversoes, atendimento: pct(atendidas, filteredRows.length), conversao: pct(conversoes, atendidas) };
  }, [filteredRows]);

  const daily = useMemo(() => {
    const map = new Map<string, { dia: string; tentativas: number; atendidas: number; conversoes: number }>();
    filteredRows.forEach((r) => {
      const d = new Date(r.created_at); const key = dateInput(d);
      const item = map.get(key) || { dia: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`, tentativas: 0, atendidas: 0, conversoes: 0 };
      item.tentativas++; if (r.ligacao_status === "atendeu") item.atendidas++;
      if (r.ligacao_status === "atendeu" && r.vota_candidato === "sim") item.conversoes++;
      map.set(key, item);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [filteredRows]);

  const setPreset = (days: number) => {
    const end = startOfToday(); const start = new Date(end); start.setDate(start.getDate() - days + 1);
    setInicio(dateInput(start)); setFim(dateInput(end));
  };

  const exportCsv = () => {
    const header = ["Data", "Operador", "Status", "Voto", "Origem", "Contato ID", "Cidade", "Bairro", "Próximo retorno"];
    const content = [header, ...filteredRows.map((r) => [fmtDateTime(r.created_at), r.operador_nome, statusLabel[r.ligacao_status] || r.ligacao_status,
      r.vota_candidato || "", r.tabela, r.contato_id, r.cidade || "", r.bairro || "", r.proxima_tentativa_em ? fmtDateTime(r.proxima_tentativa_em) : ""])]
      .map((line) => line.map(escapeCsv).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `produtividade-telemarketing-${inicio}-a-${fim}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  if (loadingClient) return <div className="p-6"><Loader2 className="mx-auto mt-20 size-8 animate-spin text-primary" /></div>;
  return (
    <div className="p-4 md:p-6">
      <TelemarketingSubNav />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Produtividade dos operadores</h1><p className="text-sm text-muted-foreground">Desempenho individual baseado em cada tentativa registrada no histórico.</p></div>
        <Button variant="outline" onClick={exportCsv} disabled={!filteredRows.length}><Download className="mr-2 size-4" /> Exportar CSV</Button>
      </div>
      {needsClientSelection && <Card><CardContent className="p-5 text-sm text-muted-foreground">Selecione um cliente para consultar a produtividade.</CardContent></Card>}
      {clientId && <>
        <Card className="mb-5"><CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setPreset(1)}>Hoje</Button><Button size="sm" variant="outline" onClick={() => setPreset(7)}>7 dias</Button><Button size="sm" variant="outline" onClick={() => setPreset(30)}>30 dias</Button></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div><Label>De</Label><Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
            <div><Label>Até</Label><Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></div>
            <div><Label>Fila</Label><Select value={campanha} onValueChange={setCampanha}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todas as filas</SelectItem>{filas.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Operador</Label><Select value={operador} onValueChange={setOperador}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos</SelectItem>{metrics.map((m) => <SelectItem key={m.key} value={m.key}>{m.nome}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex items-end"><Button className="w-full" onClick={load} disabled={loading}>{loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CalendarDays className="mr-2 size-4" />} Aplicar período</Button></div>
          </div>
        </CardContent></Card>

        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
          {([
            ["Tentativas", totals.tentativas, Phone], ["Contatos únicos", totals.contatos, Users], ["Atendidas", totals.atendidas, UserCheck],
            ["Taxa atendimento", `${totals.atendimento}%`, CheckCircle2], ["Conversões", totals.conversoes, Target], ["Taxa conversão", `${totals.conversao}%`, BarChart3],
          ] as [string, string | number, LucideIcon][]).map(([label, value, Icon]) => <Card key={label}><CardContent className="p-4"><div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="size-3.5" />{label}</div><p className="text-2xl font-bold">{value}</p></CardContent></Card>)}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_2fr]">
          <Card><CardHeader><CardTitle className="text-base">Evolução diária</CardTitle></CardHeader><CardContent className="h-72">{daily.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={daily}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="dia" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Bar dataKey="tentativas" name="Tentativas" fill="hsl(var(--primary))" radius={[3,3,0,0]} /><Bar dataKey="atendidas" name="Atendidas" fill="#22c55e" radius={[3,3,0,0]} /></BarChart></ResponsiveContainer> : <div className="grid h-full place-items-center text-sm text-muted-foreground">Sem ligações no período.</div>}</CardContent></Card>
          <Card><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base">Comparativo por operador</CardTitle><div className="relative w-56"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder="Buscar operador" value={busca} onChange={(e) => setBusca(e.target.value)} /></div></CardHeader><CardContent className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-2">Operador</th><th>Tentativas</th><th>Únicos</th><th>Atendidas</th><th>Atendimento</th><th>Conversões</th><th>Conversão</th><th>Retornos vencidos</th><th>Última atividade</th></tr></thead>
              <tbody>{visibleMetrics.map((m) => <tr key={m.key} className={`border-b hover:bg-muted/40 cursor-pointer ${selected === m.key ? "bg-primary/5" : ""}`} onClick={() => setSelected(m.key)}><td className="p-2 font-medium">{m.nome}</td><td>{m.tentativas}</td><td>{m.contatos}</td><td>{m.atendidas}</td><td><Badge variant={m.taxaAtendimento >= 40 ? "default" : "secondary"}>{m.taxaAtendimento}%</Badge></td><td>{m.conversoes}</td><td>{m.taxaConversao}%</td><td className={m.retornosVencidos ? "font-semibold text-amber-600" : ""}>{m.retornosVencidos}</td><td>{m.ultima ? fmtDateTime(m.ultima) : "—"}</td></tr>)}</tbody>
            </table>{!visibleMetrics.length && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum operador com atividade neste período.</p>}
          </CardContent></Card>
        </div>

        {selected && <Card className="mt-5"><CardHeader className="flex-row items-center justify-between"><div><CardTitle className="text-base">Auditoria — {metrics.find((m) => m.key === selected)?.nome}</CardTitle><p className="text-xs text-muted-foreground">Últimos registros considerados no cálculo; contatos repetidos representam novas tentativas.</p></div><Button size="sm" variant="ghost" onClick={() => setSelected(null)}><RotateCcw className="mr-1 size-4" /> Fechar</Button></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-2">Data/hora</th><th>Resultado</th><th>Resposta</th><th>Origem</th><th>Cidade / bairro</th><th>Retorno</th></tr></thead><tbody>{selectedRows.slice(0, 200).map((r) => <tr key={r.id} className="border-b"><td className="p-2">{fmtDateTime(r.created_at)}</td><td><Badge variant="outline">{statusLabel[r.ligacao_status] || r.ligacao_status}</Badge></td><td>{r.vota_candidato || "—"}</td><td>{r.tabela.replaceAll("_", " ")}</td><td>{[r.cidade, r.bairro].filter(Boolean).join(" / ") || "—"}</td><td>{r.proxima_tentativa_em ? fmtDateTime(r.proxima_tentativa_em) : "—"}</td></tr>)}</tbody></table>{selectedRows.length > 200 && <p className="mt-3 text-xs text-muted-foreground">Exibindo os 200 registros mais recentes. A exportação contém todos.</p>}</CardContent></Card>}
      </>}
    </div>
  );
}
