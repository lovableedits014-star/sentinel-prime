import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Download, Loader2, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client-selfhosted";

export interface IndicadoRow {
  indicado_id: string;
  nome: string;
  telefone: string | null;
  cidade: string | null;
  bairro: string | null;
  vota_candidato: string | null;
  candidato_alternativo: string | null;
  ultimo_status_ligacao: string | null;
  operador_nome: string | null;
  observacao_tele: string | null;
  ultima_ligacao_em: string | null;
  total_tentativas: number;
  indicador_id: string | null;
  indicador_nome: string | null;
  created_at: string;
}

interface Props {
  clientId: string;
  pessoaId: string;
  pessoaNome: string;
  universo: "eleicao" | "contratados";
  incluirFilhos: boolean;
  campanhaId?: string | null;
  dataDe?: string | null;
  dataAte?: string | null;
}

function votoBadge(v: string | null) {
  if (v === "sim") return <Badge className="bg-green-600 hover:bg-green-700">✅ Vota</Badge>;
  if (v === "nao") return <Badge variant="destructive">❌ Não vota</Badge>;
  if (v === "indeciso") return <Badge className="bg-yellow-500 hover:bg-yellow-600">🤔 Indeciso</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">⏳ Pendente</Badge>;
}

function fmtData(s: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}

function exportCsv(rows: IndicadoRow[], pessoaNome: string) {
  const header = ["Nome","Telefone","Cidade","Bairro","Vota","Candidato alternativo","Status ligação","Operador","Última ligação","Tentativas","Via líder","Observação"];
  const lines = rows.map(r => [
    r.nome, r.telefone ?? "", r.cidade ?? "", r.bairro ?? "",
    r.vota_candidato ?? "pendente", r.candidato_alternativo ?? "",
    r.ultimo_status_ligacao ?? "", r.operador_nome ?? "",
    r.ultima_ligacao_em ?? "", r.total_tentativas,
    r.indicador_nome ?? "", (r.observacao_tele ?? "").replace(/\n/g, " "),
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `indicados-${pessoaNome.replace(/\s+/g, "_")}-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

export default function IndicadosDaPessoaList({ clientId, pessoaId, pessoaNome, universo, incluirFilhos, campanhaId, dataDe, dataAte }: Props) {
  const [rows, setRows] = useState<IndicadoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState<"todos" | "sim" | "indeciso" | "nao" | "pendente">("todos");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("tele_ranking_indicados_da_pessoa_v2" as any, {
        _client_id: clientId,
        _pessoa_id: pessoaId,
        _universo: universo,
        _incluir_filhos: incluirFilhos,
        _campanha_id: campanhaId || null,
        _data_de: dataDe || null,
        _data_ate: dataAte || null,
      });
      if (cancel) return;
      if (error) { console.error(error); setRows([]); }
      else setRows(((data as any[]) || []) as IndicadoRow[]);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [clientId, pessoaId, universo, incluirFilhos, campanhaId, dataDe, dataAte]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filtro !== "todos") {
        if (filtro === "pendente" && r.vota_candidato) return false;
        if (filtro !== "pendente" && r.vota_candidato !== filtro) return false;
      }
      if (busca.trim()) {
        const q = busca.toLowerCase();
        if (!r.nome.toLowerCase().includes(q) && !(r.telefone ?? "").includes(busca)) return false;
      }
      return true;
    });
  }, [rows, filtro, busca]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <Tabs value={filtro} onValueChange={(v) => setFiltro(v as any)}>
          <TabsList>
            <TabsTrigger value="todos">Todos ({rows.length})</TabsTrigger>
            <TabsTrigger value="sim">✅ {rows.filter(r => r.vota_candidato === "sim").length}</TabsTrigger>
            <TabsTrigger value="indeciso">🤔 {rows.filter(r => r.vota_candidato === "indeciso").length}</TabsTrigger>
            <TabsTrigger value="nao">❌ {rows.filter(r => r.vota_candidato === "nao").length}</TabsTrigger>
            <TabsTrigger value="pendente">⏳ {rows.filter(r => !r.vota_candidato).length}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Input placeholder="Buscar nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-56" />
          <Button variant="outline" size="sm" onClick={() => exportCsv(filtered, pessoaNome)}>
            <Download className="w-4 h-4 mr-2" /> CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : (
        <div className="rounded-md border max-h-[55vh] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Voto</TableHead>
                <TableHead>Em quem (se não)</TableHead>
                <TableHead>Operador</TableHead>
                <TableHead>Última ligação</TableHead>
                {incluirFilhos && <TableHead>Via</TableHead>}
                <TableHead className="text-center">Obs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={incluirFilhos ? 8 : 7} className="text-center text-muted-foreground py-6">Nenhum indicado.</TableCell></TableRow>
              )}
              <TooltipProvider delayDuration={150}>
                {filtered.map(r => (
                  <TableRow key={r.indicado_id}>
                    <TableCell className="font-medium">
                      {r.nome}
                      {(r.cidade || r.bairro) && (
                        <div className="text-xs text-muted-foreground">{[r.bairro, r.cidade].filter(Boolean).join(" · ")}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{r.telefone || "—"}</TableCell>
                    <TableCell>{votoBadge(r.vota_candidato)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.candidato_alternativo || "—"}</TableCell>
                    <TableCell className="text-sm">{r.operador_nome || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtData(r.ultima_ligacao_em)}</TableCell>
                    {incluirFilhos && <TableCell className="text-sm text-muted-foreground">{r.indicador_nome || "—"}</TableCell>}
                    <TableCell className="text-center">
                      {r.observacao_tele ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <MessageSquare className="w-4 h-4 inline text-primary" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs whitespace-pre-wrap">{r.observacao_tele}</TooltipContent>
                        </Tooltip>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TooltipProvider>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
