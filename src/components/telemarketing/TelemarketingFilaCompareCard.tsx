import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { GitCompare, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface CompareRow {
  campanha_id: string;
  campanha_nome: string;
  total: number;
  trabalhados: number;
  pendentes: number;
  sim: number;
  nao: number;
  indeciso: number;
  nao_atendeu: number;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

export default function TelemarketingFilaCompareCard({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("tele_fila_compare" as any, { _client_id: clientId });
    setLoading(false);
    if (error) { toast.error(`Erro ao comparar filas: ${error.message}`); return; }
    setRows(((data as any[]) || []).map((r) => ({
      campanha_id: r.campanha_id,
      campanha_nome: r.campanha_nome || "Fila sem nome",
      total: num(r.total), trabalhados: num(r.trabalhados), pendentes: num(r.pendentes),
      sim: num(r.sim), nao: num(r.nao), indeciso: num(r.indeciso), nao_atendeu: num(r.nao_atendeu),
    })));
  }, [clientId]);

  useEffect(() => { if (clientId) void load(); }, [clientId, load]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><GitCompare className="size-4 text-primary" /> Comparativo entre filas</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Desempenho lado a lado de todas as filas de ligação do cliente.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando…</div>}
        {!loading && rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma fila com contatos ainda.</p>}
        {!loading && rows.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fila</TableHead><TableHead className="text-right">Contatos</TableHead>
                  <TableHead className="text-right">Ligados</TableHead><TableHead className="text-right">Pendentes</TableHead>
                  <TableHead className="text-right">Vota</TableHead><TableHead className="text-right">Não vota</TableHead>
                  <TableHead className="text-right">Indeciso</TableHead><TableHead className="text-right">Não atendeu</TableHead>
                  <TableHead className="w-32">Cobertura</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const cobertura = r.total > 0 ? Math.round((r.trabalhados / r.total) * 100) : 0;
                  return (
                    <TableRow key={r.campanha_id || r.campanha_nome}>
                      <TableCell className="font-medium">{r.campanha_nome}</TableCell>
                      <TableCell className="text-right">{r.total}</TableCell>
                      <TableCell className="text-right">{r.trabalhados}</TableCell>
                      <TableCell className="text-right">{r.pendentes}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">{r.sim}</TableCell>
                      <TableCell className="text-right">{r.nao}</TableCell>
                      <TableCell className="text-right">{r.indeciso}</TableCell>
                      <TableCell className="text-right">{r.nao_atendeu}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={cobertura} className="h-1.5" />
                          <Badge variant="secondary" className="text-[10px]">{cobertura}%</Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
