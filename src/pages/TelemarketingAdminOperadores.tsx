import { Loader2, ShieldAlert } from "lucide-react";
import TelemarketingSubNav from "@/components/telemarketing/TelemarketingSubNav";
import TelemarketingSettingsCard from "@/components/settings/TelemarketingSettingsCard";
import { useActiveClientId } from "@/hooks/useActiveClientId";

export default function TelemarketingAdminOperadores() {
  const { clientId, isLoading, needsClientSelection } = useActiveClientId();
  return (
    <div className="p-4 md:p-6">
      <TelemarketingSubNav />
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Operadores</h1>
        <p className="text-sm text-muted-foreground">Cadastro de quem pode entrar no link público para registrar ligações.</p>
      </div>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando contexto…</div>
      )}
      {!isLoading && needsClientSelection && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900 dark:text-amber-200">Selecione um cliente no seletor lateral para gerenciar operadores.</p>
        </div>
      )}
      {clientId && <TelemarketingSettingsCard clientId={clientId} />}
    </div>
  );
}
