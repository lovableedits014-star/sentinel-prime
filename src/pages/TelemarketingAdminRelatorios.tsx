import { Loader2 } from "lucide-react";
import TelemarketingSubNav from "@/components/telemarketing/TelemarketingSubNav";
import TelemarketingReportsPanel from "@/components/contratados/TelemarketingReportsPanel";
import TelemarketingSnapshotsPanel from "@/components/telemarketing/TelemarketingSnapshotsPanel";
import TelemarketingIndicadorScorecard from "@/components/telemarketing/TelemarketingIndicadorScorecard";
import { useContratadosData } from "@/components/contratados/useContratadosData";
import { useActiveClientId } from "@/hooks/useActiveClientId";

export default function TelemarketingAdminRelatorios() {
  const { contratados, indicados, loading } = useContratadosData();
  const { clientId } = useActiveClientId();
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
        <p className="text-sm text-muted-foreground">Gráficos, ranking por bairro, candidatos alternativos, comparativo entre rodadas e export PDF.</p>
      </div>
      <div className="space-y-6">
        {clientId && <TelemarketingSnapshotsPanel clientId={clientId} />}
        <TelemarketingReportsPanel contratados={contratados as any} indicados={indicados as any} />
      </div>
    </div>
  );
}
