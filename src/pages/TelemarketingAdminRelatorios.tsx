import { Loader2 } from "lucide-react";
import TelemarketingSubNav from "@/components/telemarketing/TelemarketingSubNav";
import TelemarketingReportsPanel from "@/components/contratados/TelemarketingReportsPanel";
import { useContratadosData } from "@/components/contratados/useContratadosData";

export default function TelemarketingAdminRelatorios() {
  const { contratados, indicados, loading } = useContratadosData();
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
        <p className="text-sm text-muted-foreground">Gráficos de intenção de voto, desempenho por líder e ranking de candidatos alternativos.</p>
      </div>
      <TelemarketingReportsPanel contratados={contratados as any} indicados={indicados as any} />
    </div>
  );
}
