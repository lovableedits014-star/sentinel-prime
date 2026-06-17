import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { ShieldCheck, ShieldAlert, ShieldX, Clock, Instagram, Facebook, Info } from "lucide-react";

interface Props {
  clientId: string;
}

type TokenState = {
  expiresAt: string | null;
  tokenType: string | null;
  hasIntegration: boolean;
};

type LastPostState = {
  ig: string | null;
  fb: string | null;
};

export function MetaTokenStatusCard({ clientId }: Props) {
  const [state, setState] = useState<TokenState | null>(null);
  const [lastPosts, setLastPosts] = useState<LastPostState>({ ig: null, fb: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: integ }, igRes, fbRes] = await Promise.all([
        supabase
          .from("integrations")
          .select("meta_page_id, meta_token_expires_at, meta_token_type")
          .eq("client_id", clientId)
          .maybeSingle(),
        supabase
          .from("comments")
          .select("comment_created_time")
          .eq("client_id", clientId)
          .eq("platform", "instagram")
          .eq("text", "__post_stub__")
          .order("comment_created_time", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("comments")
          .select("comment_created_time")
          .eq("client_id", clientId)
          .eq("platform", "facebook")
          .eq("text", "__post_stub__")
          .order("comment_created_time", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setState({
        expiresAt: (integ as any)?.meta_token_expires_at ?? null,
        tokenType: (integ as any)?.meta_token_type ?? null,
        hasIntegration: !!(integ as any)?.meta_page_id,
      });
      setLastPosts({
        ig: (igRes.data as any)?.comment_created_time ?? null,
        fb: (fbRes.data as any)?.comment_created_time ?? null,
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

  const fmt = (iso: string | null) => {
    if (!iso) return "nenhuma ainda";
    const d = new Date(iso);
    const hoursAgo = Math.round((Date.now() - d.getTime()) / 36e5);
    const rel = hoursAgo < 24 ? `${hoursAgo}h atrás` : `${Math.round(hoursAgo / 24)}d atrás`;
    return `${d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} (${rel})`;
  };

  return (
    <div className="space-y-2">
      <div className={`flex items-start gap-3 p-3 rounded-lg border ${styles}`}>
        <Icon className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold">{title}</p>
          <p className="opacity-90">{description}</p>
        </div>
      </div>

      <div className="flex items-start gap-3 p-3 rounded-lg border border-muted-foreground/20 bg-muted/20 text-sm">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
        <div className="space-y-1 flex-1">
          <p className="font-semibold text-foreground">Última postagem capturada do Meta</p>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Instagram className="w-3.5 h-3.5" />
            <span>Instagram: <span className="font-medium text-foreground">{fmt(lastPosts.ig)}</span></span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Facebook className="w-3.5 h-3.5" />
            <span>Facebook: <span className="font-medium text-foreground">{fmt(lastPosts.fb)}</span></span>
          </div>
          <p className="text-xs text-muted-foreground/80 pt-1">
            Se o Instagram não traz uma postagem recente que você publicou, normalmente é story (a API do Meta não disponibiliza stories) ou atraso de propagação do próprio Instagram — costuma aparecer em minutos.
          </p>
        </div>
      </div>
    </div>
  );
}
