import { ReactNode } from "react";
import { useActiveClientId } from "@/hooks/useActiveClientId";
import { Crown, AlertCircle } from "lucide-react";

interface RequireClientProps {
  children: ReactNode;
  /** Optional: show nothing while resolving (default shows a small spinner). */
  silentLoading?: boolean;
}

/**
 * Gate any module that needs a client_id. Prevents the "empty screen / broken data"
 * UX when a super admin has not picked a manager, or when a logged-in user has no
 * client/team binding.
 */
export default function RequireClient({ children, silentLoading }: RequireClientProps) {
  const { clientId, isSuperAdmin, isLoading, needsClientSelection } = useActiveClientId();

  if (isLoading) {
    if (silentLoading) return null;
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  if (needsClientSelection) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center">
            <Crown className="w-6 h-6 text-amber-400" />
          </div>
          <h2 className="text-lg font-semibold">Selecione um gerente</h2>
          <p className="text-sm text-muted-foreground">
            Você está como <strong>Super Admin</strong>. Para visualizar os dados deste módulo,
            escolha um gerente no seletor no topo da barra lateral.
          </p>
        </div>
      </div>
    );
  }

  if (!clientId && !isSuperAdmin) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/15 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold">Sem vínculo ativo</h2>
          <p className="text-sm text-muted-foreground">
            Sua conta não está associada a nenhum cliente ativo. Procure o administrador da conta.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
