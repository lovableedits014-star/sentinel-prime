import { ReactNode } from "react";
import { useActiveClientId, ACTIVE_CLIENT_QUERY_KEY } from "@/hooks/useActiveClientId";
import { useQueryClient } from "@tanstack/react-query";
import { Crown, AlertCircle, RefreshCw, WifiOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

interface RequireClientProps {
  children: ReactNode;
  /** Optional: render nothing while resolving (default shows a skeleton). */
  silentLoading?: boolean;
  /** Optional: custom skeleton variant. Defaults to "page". */
  skeletonVariant?: "page" | "list" | "cards" | "minimal";
}

function LoadingSkeleton({ variant = "page" }: { variant?: "page" | "list" | "cards" | "minimal" }) {
  if (variant === "minimal") {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <p className="text-sm text-muted-foreground">Carregando dados…</p>
        </div>
      </div>
    );
  }
  if (variant === "list") {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="space-y-2 mt-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    );
  }
  if (variant === "cards") {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    );
  }
  // page (default)
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}

/**
 * Gate any module that needs a client_id. Prevents the "empty screen / broken data"
 * UX when a super admin has not picked a manager, or when a logged-in user has no
 * client/team binding.
 */
export default function RequireClient({ children, silentLoading, skeletonVariant = "page" }: RequireClientProps) {
  const qc = useQueryClient();
  const { clientId, isSuperAdmin, isLoading, isFetching, isError, error, needsClientSelection, refetch } = useActiveClientId();

  if (isLoading || (isFetching && !clientId && !needsClientSelection && !isError)) {
    if (silentLoading) return null;
    return <LoadingSkeleton variant={skeletonVariant} />;
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/15 flex items-center justify-center">
            <WifiOff className="w-6 h-6 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold">Erro ao carregar sua conta</h2>
          <p className="text-sm text-muted-foreground">
            {(error as Error)?.message ?? "Não foi possível resolver o cliente ativo. Verifique sua conexão e tente novamente."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ACTIVE_CLIENT_QUERY_KEY });
              refetch();
            }}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar novamente
          </Button>
        </div>
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
            Sua conta não está associada a nenhum cliente ativo. Procure o administrador da conta
            para receber acesso a um gerente.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ACTIVE_CLIENT_QUERY_KEY });
              refetch();
            }}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Recarregar
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
