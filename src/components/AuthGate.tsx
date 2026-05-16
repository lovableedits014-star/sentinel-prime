import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Loader2 } from "lucide-react";

/**
 * Defesa em profundidade — Onda 2.
 *
 * Aditivo: NÃO remove gates existentes (DashboardLayout, RLS no banco).
 * Função: garante que nenhuma rota autenticada renderiza conteúdo antes da
 * sessão ser hidratada. Evita "flash" de UI protegida e redireciona
 * usuários sem sessão para /auth preservando o destino.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "authed" | "anon">("loading");
  const location = useLocation();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setState(data.session ? "authed" : "anon");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setState(session ? "authed" : "anon");
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state === "anon") {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?redirect=${redirect}`} replace />;
  }

  return <>{children}</>;
}
