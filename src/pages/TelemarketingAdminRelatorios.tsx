import { useEffect, useMemo, useState } from "react";
import { ListFilter } from "lucide-react";
import TelemarketingSubNav from "@/components/telemarketing/TelemarketingSubNav";
import TelemarketingSnapshotsPanel from "@/components/telemarketing/TelemarketingSnapshotsPanel";
import TelemarketingIndicadorScorecard from "@/components/telemarketing/TelemarketingIndicadorScorecard";
import TelemarketingFilaReportPanel from "@/components/telemarketing/TelemarketingFilaReportPanel";
import TelemarketingFilaCompareCard from "@/components/telemarketing/TelemarketingFilaCompareCard";
import { useActiveClientId } from "@/hooks/useActiveClientId";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL_FILAS = "__all__";

export default function TelemarketingAdminRelatorios() {
  const { clientId } = useActiveClientId();
  const [filas, setFilas] = useState<{ id: string; nome: string }[]>([]);
  const [filaSel, setFilaSel] = useState(ALL_FILAS);

  useEffect(() => {
    if (!clientId) { setFilas([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("tele_fila_summary" as never, { _client_id: clientId } as never);
      if (cancelled) return;
      setFilas(((data as unknown as { campanha_id: string; nome: string }[]) || []).map((r) => ({ id: r.campanha_id, nome: r.nome })));
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const campanhaId = filaSel === ALL_FILAS ? null : filaSel;
  const campanhaNome = useMemo(
    () => (campanhaId ? filas.find((f) => f.id === campanhaId)?.nome || "Fila" : "Toda a base"),
    [campanhaId, filas],
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
      </div>

      {clientId && (
        <Card className="mb-6">
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-[260px] space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs"><ListFilter className="size-3.5" /> Fila analisada</Label>
              <Select value={filaSel} onValueChange={setFilaSel}>
                <SelectTrigger><SelectValue placeholder="Toda a base" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILAS}>Toda a base (inclui contatos sem fila)</SelectItem>
                  {filas.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground max-w-md">
              A seleção vale para o resultado geral, indicadores e snapshots. O comparativo continua mostrando todas
              as filas lado a lado. Em “Toda a base”, contatos ainda sem fila também são contabilizados.
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
        {clientId && <TelemarketingSnapshotsPanel clientId={clientId} campanhaId={campanhaId} campanhaNome={campanhaNome} />}
      </div>
    </div>
  );
}
