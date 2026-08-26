import { useEffect, useMemo, useState } from "react";
import { Loader2, ListFilter } from "lucide-react";
import TelemarketingSubNav from "@/components/telemarketing/TelemarketingSubNav";
import TelemarketingReportsPanel from "@/components/contratados/TelemarketingReportsPanel";
import TelemarketingSnapshotsPanel from "@/components/telemarketing/TelemarketingSnapshotsPanel";
import TelemarketingIndicadorScorecard from "@/components/telemarketing/TelemarketingIndicadorScorecard";
import TelemarketingFilaReportPanel from "@/components/telemarketing/TelemarketingFilaReportPanel";
import TelemarketingFilaCompareCard from "@/components/telemarketing/TelemarketingFilaCompareCard";
import { useTelemarketingAdminData } from "@/components/telemarketing/useTelemarketingAdminData";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL_FILAS = "__all__";

export default function TelemarketingAdminRelatorios() {
  const { clientId, contratados, indicados, loading, error } = useTelemarketingAdminData();
  const [filas, setFilas] = useState<{ id: string; nome: string }[]>([]);
  const [filaSel, setFilaSel] = useState(ALL_FILAS);

  useEffect(() => {
    if (!clientId) { setFilas([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("tele_fila_summary" as any, { _client_id: clientId });
      if (cancelled) return;
      setFilas(((data as any[]) || []).map((r) => ({ id: r.campanha_id, nome: r.nome })));
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const campanhaId = filaSel === ALL_FILAS ? null : filaSel;
  const campanhaNome = useMemo(
    () => (campanhaId ? filas.find((f) => f.id === campanhaId)?.nome || "Fila" : "Todas as filas"),
    [campanhaId, filas],
  );

  if (loading) return (
    <div className="p-4 md:p-6">
      <TelemarketingSubNav />
      <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
    </div>
  );

  return (
    <div className="p-4 md:p-6">
      <TelemarketingSubNav />
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          Resultados de qualquer fila de ligação — planilhas, estrutura eleitoral, contratados, indicados e avulsos —
          com comparativo entre filas, ranking por bairro, candidatos alternativos e export Excel/PDF.
        </p>
        {error && <p className="text-sm text-destructive mt-2">Erro ao carregar: {error}</p>}
      </div>

      {clientId && (
        <Card className="mb-6">
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-[260px] space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs"><ListFilter className="size-3.5" /> Fila analisada</Label>
              <Select value={filaSel} onValueChange={setFilaSel}>
                <SelectTrigger><SelectValue placeholder="Todas as filas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILAS}>Todas as filas</SelectItem>
                  {filas.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground max-w-md">
              O filtro vale para todos os painéis abaixo. Escolha uma fila para medir só aquela lista, ou deixe em
              “Todas as filas” para o resultado geral do cliente.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {clientId && <TelemarketingFilaCompareCard clientId={clientId} />}
        {clientId && (
          <TelemarketingFilaReportPanel clientId={clientId} campanhaId={campanhaId} campanhaNome={campanhaNome} />
        )}
        {clientId && <TelemarketingIndicadorScorecard clientId={clientId} campanhaId={campanhaId} />}
        {clientId && <TelemarketingSnapshotsPanel clientId={clientId} />}
        <TelemarketingReportsPanel contratados={contratados as any} indicados={indicados as any} />
      </div>
    </div>
  );
}
