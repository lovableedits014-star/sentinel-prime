import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { ShieldCheck, ShieldAlert, ShieldX, Clock } from "lucide-react";

interface Props {
  clientId: string;
}

type TokenState = {
  expiresAt: string | null;
  tokenType: string | null;
  hasIntegration: boolean;
};

export function MetaTokenStatusCard({ clientId }: Props) {
  const [state, setState] = useState<TokenState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("integrations")
        .select("meta_page_id, meta_token_expires_at, meta_token_type")
        .eq("client_id", clientId)
        .maybeSingle();
      if (cancelled) return;
      setState({
        expiresAt: (data as any)?.meta_token_expires_at ?? null,
        tokenType: (data as any)?.meta_token_type ?? null,
        hasIntegration: !!(data as any)?.meta_page_id,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (loading || !state || !state.hasIntegration) return null;

  const { expiresAt, tokenType } = state;
  const now = Date.now();
  const expiresMs = expiresAt ? new Date(expiresAt).getTime() : null;
  const daysLeft = expiresMs ? Math.ceil((expiresMs - now) / (1000 * 60 * 60 * 24)) : null;

  let variant: "success" | "warning" | "destructive" | "muted" = "muted";
  let Icon = Clock;
  let title = "";
  let description = "";

  if (expiresMs === null) {
    variant = "muted";
    Icon = Clock;
    title = "Validade do token Meta desconhecida";
    description = "Reconecte a integração para registrar a data de expiração.";
  } else if (daysLeft! < 0) {
    variant = "destructive";
    Icon = ShieldX;
    title = `Token Meta vencido há ${Math.abs(daysLeft!)} dia(s)`;
    description = "A integração com Facebook/Instagram não funcionará até renovar o token.";
  } else if (daysLeft! <= 7) {
    variant = "destructive";
    Icon = ShieldX;
    title = `Token Meta expira em ${daysLeft} dia(s)`;
    description = `Renove agora para não perder a integração. Validade: ${new Date(expiresAt!).toLocaleDateString("pt-BR")}.`;
  } else if (daysLeft! <= 30) {
    variant = "warning";
    Icon = ShieldAlert;
    title = `Token Meta expira em ${daysLeft} dias`;
    description = `Renove em breve. Validade: ${new Date(expiresAt!).toLocaleDateString("pt-BR")}.`;
  } else {
    variant = "success";
    Icon = ShieldCheck;
    title = `Token Meta válido — ${daysLeft} dias restantes`;
    description = `${tokenType === "long_lived" ? "Token de longa duração. " : ""}Validade: ${new Date(expiresAt!).toLocaleDateString("pt-BR")}.`;
  }

  const styles = {
    success: "border-success/30 bg-success/5 text-success",
    warning: "border-warning/30 bg-warning/5 text-warning",
    destructive: "border-destructive/30 bg-destructive/5 text-destructive",
    muted: "border-muted-foreground/20 bg-muted/30 text-muted-foreground",
  }[variant];

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${styles}`}>
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="text-sm">
        <p className="font-semibold">{title}</p>
        <p className="opacity-90">{description}</p>
      </div>
    </div>
  );
}
