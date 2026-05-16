import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Loader2 } from "lucide-react";

type RoleCheck = "super_admin";

/**
 * Defesa em profundidade — Onda 2.
 *
 * Aditivo: NÃO substitui a checagem server-side dentro da página (que
 * permanece como gate principal). Apenas evita renderizar a página inteira
 * para quem não tem a role, melhorando UX e reduzindo superfície.
 *
 * Hoje só suporta "super_admin" (via RPC `is_super_admin`). Outras roles
 * podem ser adicionadas conforme a aplicação evoluir.
 */
export default function RequireRole({
  role,
  children,
  fallback = "/dashboard",
}: {
  role: RoleCheck;
  children: React.ReactNode;
  fallback?: string;
}) {
  const [state, setState] = useState<"loading" | "ok" | "denied">("loading");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session) {
        setState("denied");
        return;
      }
      if (role === "super_admin") {
        const { data, error } = await supabase.rpc("is_super_admin");
        if (!mounted) return;
        setState(!error && data === true ? "ok" : "denied");
      } else {
        setState("denied");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [role]);

  if (state === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state === "denied") {
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}
