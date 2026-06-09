import { Loader2 } from "lucide-react";
import TelemarketingSubNav from "@/components/telemarketing/TelemarketingSubNav";
import TelemarketingReportsPanel from "@/components/contratados/TelemarketingReportsPanel";
import TelemarketingSnapshotsPanel from "@/components/telemarketing/TelemarketingSnapshotsPanel";
import TelemarketingIndicadorScorecard from "@/components/telemarketing/TelemarketingIndicadorScorecard";
import { useTelemarketingAdminData } from "@/components/telemarketing/useTelemarketingAdminData";

export default function TelemarketingAdminRelatorios() {
  const { clientId, contratados, indicados, loading, error } = useTelemarketingAdminData();
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
        <p className="text-sm text-muted-foreground">Gráficos, ranking por bairro, candidatos alternativos, comparativo entre rodadas e export PDF — agora com todas as filas (contratados, eleição e avulsos).</p>
        {error && <p className="text-sm text-destructive mt-2">Erro ao carregar: {error}</p>}
      </div>
      <div className="space-y-6">
        {clientId && <TelemarketingIndicadorScorecard clientId={clientId} />}
        {clientId && <TelemarketingSnapshotsPanel clientId={clientId} />}
        <TelemarketingReportsPanel contratados={contratados as any} indicados={indicados as any} />
      </div>
    </div>
  );
}
