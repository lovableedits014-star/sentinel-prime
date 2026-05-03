import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Share2, Users, Trophy, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface ReferralPanelProps {
  accountId: string;
  clientId: string;
}

export function ReferralPanel({ accountId, clientId }: ReferralPanelProps) {
  const [copied, setCopied] = useState(false);

  // Load or create referral code
  const { data: referralCode, isLoading: codeLoading } = useQuery({
    queryKey: ["referral-code", accountId],
    queryFn: async () => {
      // Try to fetch existing code
      const { data: existing } = await supabase
        .from("referral_codes")
        .select("code")
        .eq("supporter_account_id", accountId)
        .eq("client_id", clientId)
        .maybeSingle();

      if (existing) return existing.code;

      // Generate a new one
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let code = "";
      for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }

      const { error } = await supabase
        .from("referral_codes")
        .insert({ supporter_account_id: accountId, client_id: clientId, code });

      if (error) {
        console.error("Error creating referral code:", error);
        return null;
      }
      return code;
    },
    enabled: !!accountId && !!clientId,
  });

  // Load referrals made by this user
  const { data: referrals } = useQuery({
    queryKey: ["my-referrals", accountId],
    queryFn: async () => {
      const { data } = await supabase
        .from("referrals")
        .select("id, created_at, referred_account_id, supporter_accounts!referrals_referred_account_id_fkey(name)")
        .eq("referrer_account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!accountId,
  });

  // Top 10 multipliers for this client
  const { data: topMultipliers } = useQuery({
    queryKey: ["top-multipliers", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("referrals")
        .select("referrer_account_id, supporter_accounts!referrals_referrer_account_id_fkey(name)")
        .eq("client_id", clientId);

      if (!data || data.length === 0) return [];

      // Count referrals per user
      const counts: Record<string, { name: string; count: number }> = {};
      for (const r of data) {
        const id = r.referrer_account_id;
        const name = (r as any).supporter_accounts?.name || "Apoiador";
        if (!counts[id]) counts[id] = { name, count: 0 };
        counts[id].count++;
      }

      return Object.entries(counts)
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    },
    enabled: !!clientId,
  });

  const referralLink = referralCode
    ? `${window.location.origin}/cadastro/${clientId}?ref=${referralCode}`
    : "";

  const handleCopy = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success("Link copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!referralLink || !navigator.share) {
      handleCopy();
      return;
    }
    try {
      await navigator.share({
        title: "Junte-se a nós!",
        text: "Cadastre-se como apoiador usando meu link:",
        url: referralLink,
      });
    } catch {
      // User cancelled share
    }
  };

  const myCount = referrals?.length || 0;

  return (
    <div className="space-y-4">
      {/* Invite Link Card */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-6 space-y-4">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Users className="w-7 h-7 text-primary" />
            </div>
            <h3 className="font-bold text-lg">Convide seus amigos!</h3>
            <p className="text-sm text-muted-foreground">
              Compartilhe seu link exclusivo e ajude a crescer a rede de apoiadores
            </p>
          </div>

          {codeLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : referralCode ? (
            <>
              <div className="bg-background rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Seu código</p>
                <p className="text-2xl font-mono font-bold tracking-widest text-primary">{referralCode}</p>
              </div>

              <div className="flex gap-2">
                <Button className="flex-1" variant="outline" onClick={handleCopy}>
                  {copied ? <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-500" /> : <Copy className="w-4 h-4 mr-2" />}
                  {copied ? "Copiado!" : "Copiar Link"}
                </Button>
                <Button className="flex-1" onClick={handleShare}>
                  <Share2 className="w-4 h-4 mr-2" />
                  Compartilhar
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center">Erro ao gerar código</p>
          )}
        </CardContent>
      </Card>

      {/* My stats */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Apoiadores convidados por você</p>
              <p className="text-3xl font-bold text-primary">{myCount}</p>
            </div>
            <Badge variant="secondary" className="text-xs">
              {myCount === 0 ? "Comece agora!" : myCount >= 10 ? "🏆 Top Multiplicador" : myCount >= 5 ? "🔥 Ativo!" : "Continue assim!"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* My referrals list */}
      {referrals && referrals.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Seus convidados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {referrals.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                <span className="font-medium">{r.supporter_accounts?.name || "Apoiador"}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Top 10 Ranking */}
      {topMultipliers && topMultipliers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <CardTitle className="text-sm">Top Multiplicadores</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {topMultipliers.map((m, i) => (
              <div key={m.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`w-5 text-center font-bold ${i < 3 ? "text-amber-500" : "text-muted-foreground"}`}>
                    {i + 1}º
                  </span>
                  <span className="font-medium">{m.name}</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {m.count} {m.count === 1 ? "convite" : "convites"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
