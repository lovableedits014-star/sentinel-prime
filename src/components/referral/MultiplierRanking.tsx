import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, Trophy, TrendingUp, UserPlus, Percent } from "lucide-react";

interface MultiplierRankingProps {
  clientId: string;
}

export function MultiplierRanking({ clientId }: MultiplierRankingProps) {
  // Fetch supporters with referral_count > 0
  const { data: topMultipliers } = useQuery({
    queryKey: ["top-multipliers", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("supporters")
        .select("id, name, referral_count")
        .eq("client_id", clientId)
        .gt("referral_count", 0)
        .order("referral_count", { ascending: false })
        .limit(10);
      return (data || []) as Array<{ id: string; name: string; referral_count: number }>;
    },
    enabled: !!clientId,
  });

  // Fetch total supporters and referred count
  const { data: referralStats } = useQuery({
    queryKey: ["referral-stats", clientId],
    queryFn: async () => {
      const { count: totalCount } = await supabase
        .from("supporter_accounts")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId);

      const { count: referredCount } = await supabase
        .from("supporter_accounts")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId)
        .not("referred_by", "is", null);

      const totalReferrals = (await supabase
        .from("referrals")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)).count || 0;

      return {
        total: totalCount || 0,
        referred: referredCount || 0,
        totalReferrals,
        organic: (totalCount || 0) - (referredCount || 0),
        percentage: totalCount ? Math.round(((referredCount || 0) / totalCount) * 100) : 0,
      };
    },
    enabled: !!clientId,
  });

  const maxReferrals = topMultipliers?.[0]?.referral_count || 1;

  return (
    <div className="space-y-4">
      {/* Intro explanation */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="pt-4 pb-3 px-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Multiplicadores</strong> são apoiadores que compartilham seu link de convite e trazem novos cadastros para a base.
            Quanto mais indicações um apoiador faz, maior seu poder de multiplicação. Acompanhe aqui o impacto orgânico vs. indicação e quem são seus maiores multiplicadores.
          </p>
        </CardContent>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Total Base</p>
            </div>
            <p className="text-2xl font-bold">{referralStats?.total || 0}</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">Todos os apoiadores cadastrados no portal</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <UserPlus className="w-3.5 h-3.5 text-primary" />
              <p className="text-xs text-muted-foreground">Por Indicação</p>
            </div>
            <p className="text-2xl font-bold text-primary">{referralStats?.referred || 0}</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">Vieram através do link de um multiplicador</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Orgânico</p>
            </div>
            <p className="text-2xl font-bold">{referralStats?.organic || 0}</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">Cadastraram-se sem link de indicação</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Percent className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">% Indicação</p>
            </div>
            <p className="text-2xl font-bold">{referralStats?.percentage || 0}%</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">Proporção da base vinda por indicação</p>
          </CardContent>
        </Card>
      </div>

      {/* Organic vs Referral visual bar */}
      {referralStats && referralStats.total > 0 && (
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs font-medium text-muted-foreground mb-1">Crescimento: Orgânico vs Indicação</p>
            <p className="text-[10px] text-muted-foreground/70 mb-2">Visualize de onde vem o crescimento da sua base de apoiadores</p>
            <div className="flex rounded-full overflow-hidden h-4">
              <div
                className="bg-primary transition-all"
                style={{ width: `${referralStats.percentage}%` }}
                title={`Indicação: ${referralStats.referred}`}
              />
              <div
                className="bg-muted transition-all"
                style={{ width: `${100 - referralStats.percentage}%` }}
                title={`Orgânico: ${referralStats.organic}`}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-primary inline-block" />
                Indicação ({referralStats.percentage}%)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-muted inline-block border" />
                Orgânico ({100 - referralStats.percentage}%)
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Multipliers Ranking */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" />
            Top Multiplicadores
          </CardTitle>
          <CardDescription className="text-xs">
            Apoiadores que mais trouxeram novos cadastros por indicação. A barra mostra a proporção em relação ao maior multiplicador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!topMultipliers || topMultipliers.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma indicação registrada ainda</p>
              <p className="text-xs mt-1">Quando apoiadores usarem seus links de convite, o ranking aparecerá aqui</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topMultipliers.map((m, i) => (
                <div key={m.id} className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    i === 0 ? "bg-primary text-primary-foreground" :
                    i === 1 ? "bg-primary/20 text-primary" :
                    i === 2 ? "bg-primary/10 text-primary" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Progress value={(m.referral_count / maxReferrals) * 100} className="h-1.5 flex-1" />
                      <span className="text-xs font-bold text-muted-foreground shrink-0">{m.referral_count}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
