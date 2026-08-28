import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Search } from "lucide-react";
import TelemarketingSubNav from "@/components/telemarketing/TelemarketingSubNav";
import type { FilaReportRow } from "@/components/telemarketing/TelemarketingFilaReportPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useActiveClientId } from "@/hooks/useActiveClientId";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ALL = "__all__";
const PAGE_SIZE = 1000;
const RESULT_LABEL: Record<string, string> = { atendeu: "Atendeu", nao_atendeu: "Não atendeu", reagendou: "Reagendou", invalido: "Inválido", pendente: "Pendente" };
const VOTE_LABEL: Record<string, string> = { sim: "Vota", nao: "Não vota", indeciso: "Indeciso", nao_quis_opinar: "Não quis opinar" };
const resultOf = (r: FilaReportRow) => r.ligacao_em || r.total_tentativas > 0 ? r.ligacao_status || "pendente" : "pendente";
const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export default function TelemarketingAdminResultados() {
  const { clientId } = useActiveClientId();
  const [rows, setRows] = useState<FilaReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState(ALL);
  const [campaign, setCampaign] = useState(ALL);
  const [operator, setOperator] = useState(ALL);
  const [result, setResult] = useState(ALL);
  const [vote, setVote] = useState(ALL);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    const all: FilaReportRow[] = [];
    let page = 0;
    while (true) {
      const from = page * PAGE_SIZE;
      const response = await supabase.rpc("tele_fila_report_rows_v2" as never, { _client_id: clientId, _campanha_id: null } as never)
        .order("tabela").order("contato_id").range(from, from + PAGE_SIZE - 1);
      if (response.error) { toast.error(`Erro ao carregar contatos: ${response.error.message}`); setLoading(false); return; }
      const part = ((response.data as unknown[]) || []) as FilaReportRow[];
      all.push(...part);
      if (part.length < PAGE_SIZE) break;
      page += 1;
    }
    setRows(all); setLoading(false);
  }, [clientId]);
  useEffect(() => { void load(); }, [load]);

  const options = useMemo(() => ({
    origins: [...new Set(rows.map((r) => r.origem))].sort(),
    campaigns: [...new Set(rows.map((r) => r.campanha_nome || "Sem fila"))].sort(),
    operators: [...new Set(rows.map((r) => r.operador_nome).filter(Boolean) as string[])].sort(),
  }), [rows]);
  const filtered = useMemo(() => rows.filter((r) => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    if (q && !`${r.nome} ${r.telefone} ${r.cidade || ""} ${r.bairro || ""}`.toLocaleLowerCase("pt-BR").includes(q)) return false;
    if (origin !== ALL && r.origem !== origin) return false;
    if (campaign !== ALL && (r.campanha_nome || "Sem fila") !== campaign) return false;
    if (operator !== ALL && r.operador_nome !== operator) return false;
    if (result !== ALL && resultOf(r) !== result) return false;
    if (vote !== ALL && (r.vota_candidato || "sem_resposta") !== vote) return false;
    return true;
  }), [rows, search, origin, campaign, operator, result, vote]);

  const exportCsv = () => {
    const header = ["Contato","Telefone","Origem","Fila","Cidade","Bairro","Resultado","Voto","Operador","Tentativas","Última ligação"];
    const lines = filtered.map((r) => [r.nome,r.telefone,r.origem,r.campanha_nome || "Sem fila",r.cidade,r.bairro,
      RESULT_LABEL[resultOf(r)] || resultOf(r),VOTE_LABEL[r.vota_candidato || ""] || "Sem resposta",r.operador_nome,
      r.total_tentativas,r.ligacao_em ? new Date(r.ligacao_em).toLocaleString("pt-BR") : ""]);
    const blob = new Blob(["\uFEFF", [header, ...lines].map((line) => line.map(csv).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `contatos-telemarketing-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return <div className="p-4 md:p-6"><TelemarketingSubNav />
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Contatos e resultados</h1><p className="text-sm text-muted-foreground">Situação atual de cada contato em todas as origens. Tentativas anteriores ficam na auditoria de Produtividade.</p></div><Button variant="outline" onClick={exportCsv} disabled={!filtered.length}><Download className="mr-2 size-4"/>CSV</Button></div>
    <Card><CardContent className="space-y-4 p-4">
      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        <div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground"/><Input className="pl-9" placeholder="Nome, telefone ou local" value={search} onChange={(e) => setSearch(e.target.value)}/></div>
        <Select value={origin} onValueChange={setOrigin}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value={ALL}>Todas as origens</SelectItem>{options.origins.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
        <Select value={campaign} onValueChange={setCampaign}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value={ALL}>Todas as filas</SelectItem>{options.campaigns.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
        <Select value={operator} onValueChange={setOperator}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos os operadores</SelectItem>{options.operators.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
        <Select value={result} onValueChange={setResult}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos os resultados</SelectItem>{Object.entries(RESULT_LABEL).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
        <Select value={vote} onValueChange={setVote}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos os votos</SelectItem><SelectItem value="sem_resposta">Sem resposta</SelectItem>{Object.entries(VOTE_LABEL).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
      </div>
      {loading ? <div className="flex items-center justify-center py-16 text-sm text-muted-foreground"><Loader2 className="mr-2 size-5 animate-spin"/>Carregando a base completa…</div> : <><p className="text-xs text-muted-foreground">{filtered.length} de {rows.length} contato(s)</p><div className="max-h-[65vh] overflow-auto rounded-md border"><Table><TableHeader className="sticky top-0 bg-background"><TableRow><TableHead>Contato</TableHead><TableHead>Origem</TableHead><TableHead>Fila</TableHead><TableHead>Resultado</TableHead><TableHead>Voto</TableHead><TableHead>Operador</TableHead><TableHead>Tentativas</TableHead><TableHead>Última ligação</TableHead></TableRow></TableHeader><TableBody>
        {filtered.map((r) => <TableRow key={`${r.tabela}-${r.contato_id}`}><TableCell><p className="font-medium">{r.nome}</p><p className="text-xs text-muted-foreground">{r.telefone} · {[r.bairro,r.cidade].filter(Boolean).join(" / ")}</p></TableCell><TableCell className="text-xs">{r.origem}</TableCell><TableCell className="text-xs">{r.campanha_nome || "Sem fila"}</TableCell><TableCell><Badge variant="outline">{RESULT_LABEL[resultOf(r)] || resultOf(r)}</Badge></TableCell><TableCell>{VOTE_LABEL[r.vota_candidato || ""] || "Sem resposta"}</TableCell><TableCell>{r.operador_nome || "—"}</TableCell><TableCell className="text-center">{r.total_tentativas}</TableCell><TableCell className="text-xs">{r.ligacao_em ? new Date(r.ligacao_em).toLocaleString("pt-BR") : "—"}</TableCell></TableRow>)}
      </TableBody></Table></div></>}
    </CardContent></Card>
  </div>;
}
