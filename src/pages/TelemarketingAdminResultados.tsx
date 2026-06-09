import { Loader2 } from "lucide-react";
import TelemarketingSubNav from "@/components/telemarketing/TelemarketingSubNav";
import TelemarketingResultsPanel from "@/components/contratados/TelemarketingResultsPanel";
import { useTelemarketingAdminData } from "@/components/telemarketing/useTelemarketingAdminData";

export default function TelemarketingAdminResultados() {
  const { contratados, indicados, loading, error } = useTelemarketingAdminData();
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
        <h1 className="text-2xl font-bold">Resultados detalhados</h1>
        <p className="text-sm text-muted-foreground">Lista completa de ligações registradas em todas as filas, com filtros por status, voto e operador.</p>
        {error && <p className="text-sm text-destructive mt-2">Erro ao carregar: {error}</p>}
      </div>
      <TelemarketingResultsPanel contratados={contratados as any} indicados={indicados as any} />
    </div>
  );
}
