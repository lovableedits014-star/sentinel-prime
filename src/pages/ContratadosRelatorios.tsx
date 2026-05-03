import { Loader2 } from "lucide-react";
import ContratadosSubNav from "@/components/contratados/ContratadosSubNav";
import TelemarketingReportsPanel from "@/components/contratados/TelemarketingReportsPanel";
import { useContratadosData } from "@/components/contratados/useContratadosData";

export default function ContratadosRelatorios() {
  const { contratados, indicados, loading } = useContratadosData();

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-4 md:p-6">
      <ContratadosSubNav />
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Relatórios da Equipe</h1>
        <p className="text-sm text-muted-foreground">
          Performance de captação, presença e telemarketing dos contratados.
        </p>
      </div>
      <TelemarketingReportsPanel contratados={contratados as any} indicados={indicados as any} />
    </div>
  );
}
