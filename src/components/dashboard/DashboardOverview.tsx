import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import {
  Users, UserCheck, CalendarCheck, PhoneCall, Sparkles, Crown, ArrowRight,
  Flame, BookUser, ShieldCheck, AlertTriangle, TrendingUp, Briefcase, Cake, MessageCircle,
} from "lucide-react";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from "@/components/ui/chart";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, PieChart, Pie, Cell,
} from "recharts";

interface DashboardOverviewProps {
  clientId: string;
}

const formatDate = (d: Date) =>
  d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export function DashboardOverview({ clientId }: DashboardOverviewProps) {
  // ─────────── KPIs principais ───────────
  const { data: kpis } = useQuery({
    queryKey: ["overview-kpis", clientId],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenIso = sevenDaysAgo.toISOString();
      const sevenDate = sevenIso.split("T")[0];

      const [
        pessoasTotal,
        pessoasNovas7d,
        pessoasComprometidas,
        contratadosAtivos,
        lideresTotal,
        funcionariosAtivos,
        contratadoCheckinsHoje,
        funcionarioCheckinsHoje,
        indicadosPendentes,
        indicadosTotal,
      ] = await Promise.all([
        supabase.from("pessoas").select("id", { count: "exact", head: true }).eq("client_id", clientId),
        supabase.from("pessoas").select("id", { count: "exact", head: true }).eq("client_id", clientId).gte("created_at", sevenIso),
        supabase.from("pessoas").select("id", { count: "exact", head: true }).eq("client_id", clientId).in("nivel_apoio", ["apoiador", "militante"]),
        supabase.from("contratados").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("status", "ativo"),
        supabase.from("contratados").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("is_lider", true).eq("status", "ativo"),
        supabase.from("funcionarios").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("status", "ativo"),
        supabase.from("contratado_checkins").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("checkin_date", today),
        supabase.from("funcionario_checkins").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("checkin_date", today),
        supabase.from("contratado_indicados").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("ligacao_status", "pendente"),
        supabase.from("contratado_indicados").select("id", { count: "exact", head: true }).eq("client_id", clientId),
      ]);

      return {
        pessoasTotal: pessoasTotal.count || 0,
        pessoasNovas7d: pessoasNovas7d.count || 0,
        pessoasComprometidas: pessoasComprometidas.count || 0,
        contratadosAtivos: contratadosAtivos.count || 0,
        lideresTotal: lideresTotal.count || 0,
        funcionariosAtivos: funcionariosAtivos.count || 0,
        checkinsHoje: (contratadoCheckinsHoje.count || 0) + (funcionarioCheckinsHoje.count || 0),
        indicadosPendentes: indicadosPendentes.count || 0,
        indicadosTotal: indicadosTotal.count || 0,
        sevenDate,
      };
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 2,
  });

  // ─────────── Crescimento da base (14 dias) ───────────
  const { data: growthSeries } = useQuery({
    queryKey: ["overview-growth-14d", clientId],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 13);
      since.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("pessoas")
        .select("created_at")
        .eq("client_id", clientId)
        .gte("created_at", since.toISOString());

      const buckets: Record<string, number> = {};
      for (let i = 0; i < 14; i++) {
        const d = new Date(since);
        d.setDate(since.getDate() + i);
        buckets[formatDate(d)] = 0;
      }
      (data || []).forEach((p: any) => {
        const key = formatDate(new Date(p.created_at));
        if (key in buckets) buckets[key] += 1;
      });
      return Object.entries(buckets).map(([date, novas]) => ({ date, novas }));
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 5,
  });

  // ─────────── Distribuição por nível de apoio ───────────
  const { data: nivelApoio } = useQuery({
    queryKey: ["overview-nivel-apoio", clientId],
    queryFn: async () => {
      const niveis = ["militante", "apoiador", "simpatizante", "desconhecido", "opositor"] as const;
      const results = await Promise.all(
        niveis.map(n =>
          supabase
            .from("pessoas")
            .select("id", { count: "exact", head: true })
            .eq("client_id", clientId)
            .eq("nivel_apoio", n)
        )
      );
      return niveis.map((n, i) => ({ nivel: n, count: results[i].count || 0 }));
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 5,
  });

  // ─────────── Top 5 líderes por liderados ───────────
  const { data: topLideres } = useQuery({
    queryKey: ["overview-top-lideres", clientId],
    queryFn: async () => {
      const { data: lideres } = await supabase
        .from("contratados")
        .select("id, nome")
        .eq("client_id", clientId)
        .eq("is_lider", true)
        .eq("status", "ativo");

      if (!lideres || lideres.length === 0) return [];

      const counts = await Promise.all(
        lideres.map(async (l: any) => {
          const { count } = await supabase
            .from("contratados")
            .select("id", { count: "exact", head: true })
            .eq("client_id", clientId)
            .eq("lider_id", l.id);
          return { nome: l.nome, liderados: count || 0 };
        })
      );
      return counts
        .filter(c => c.liderados > 0)
        .sort((a, b) => b.liderados - a.liderados)
        .slice(0, 5);
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 5,
  });

  // ─────────── Aniversariantes hoje ───────────
  const { data: aniversariantes } = useQuery({
    queryKey: ["overview-aniversariantes", clientId],
    queryFn: async () => {
      const today = new Date();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const { data } = await supabase
        .from("pessoas")
        .select("id, nome, data_nascimento")
        .eq("client_id", clientId)
        .not("data_nascimento", "is", null);
      return (data || []).filter((p: any) => {
        if (!p.data_nascimento) return false;
        const date = new Date(p.data_nascimento);
        return (
          String(date.getMonth() + 1).padStart(2, "0") === mm &&
          String(date.getDate()).padStart(2, "0") === dd
        );
      });
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 30,
  });

  // Cores
  const NIVEL_COLORS: Record<string, string> = {
    militante: "hsl(142, 71%, 45%)",
    apoiador: "hsl(160, 60%, 50%)",
    simpatizante: "hsl(48, 95%, 55%)",
    desconhecido: "hsl(var(--muted-foreground))",
    opositor: "hsl(0, 84%, 60%)",
  };
  const NIVEL_LABEL: Record<string, string> = {
    militante: "Militante",
    apoiador: "Apoiador",
    simpatizante: "Simpatizante",
    desconhecido: "Desconhecido",
    opositor: "Opositor",
  };

  const totalObrigatorios = (kpis?.contratadosAtivos || 0) + (kpis?.funcionariosAtivos || 0);
  const presencaPct = totalObrigatorios > 0
    ? Math.round(((kpis?.checkinsHoje || 0) / totalObrigatorios) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Section title */}
      <div className="flex items-center gap-2">
        <Flame className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold">Visão Executiva da Campanha</h2>
      </div>

      {/* ── KPIs em 3 pilares ── */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Card className="h-full">
          <CardContent className="pt-4 pb-3 px-4">
            <BookUser className="w-4 h-4 text-primary mb-1" />
            <p className="text-2xl font-bold">{kpis?.pessoasTotal ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">Base Política</p>
            {kpis && kpis.pessoasNovas7d > 0 && (
              <p className="text-[10px] text-green-600 font-medium mt-0.5">
                +{kpis.pessoasNovas7d} em 7 dias
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardContent className="pt-4 pb-3 px-4">
            <ShieldCheck className="w-4 h-4 text-green-600 mb-1" />
            <p className="text-2xl font-bold">{kpis?.pessoasComprometidas ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">Apoio comprometido</p>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardContent className="pt-4 pb-3 px-4">
            <Users className="w-4 h-4 text-primary mb-1" />
            <p className="text-2xl font-bold">{kpis?.contratadosAtivos ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">
              Contratados <span className="text-muted-foreground/70">({kpis?.lideresTotal ?? 0} líderes)</span>
            </p>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardContent className="pt-4 pb-3 px-4">
            <Briefcase className="w-4 h-4 text-primary mb-1" />
            <p className="text-2xl font-bold">{kpis?.funcionariosAtivos ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">Funcionários ativos</p>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardContent className="pt-4 pb-3 px-4">
            <CalendarCheck className="w-4 h-4 text-primary mb-1" />
            <p className="text-2xl font-bold">{kpis?.checkinsHoje ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">
              Check-ins hoje {totalObrigatorios > 0 && `· ${presencaPct}%`}
            </p>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardContent className="pt-4 pb-3 px-4">
            <PhoneCall className="w-4 h-4 text-primary mb-1" />
            <p className="text-2xl font-bold">{kpis?.indicadosPendentes ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">
              Indicados a ligar {kpis && kpis.indicadosTotal > 0 && `de ${kpis.indicadosTotal}`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Gráficos ── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Crescimento da base */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Crescimento da Base (14 dias)</CardTitle>
            </div>
            <CardDescription>Novas pessoas cadastradas por dia</CardDescription>
          </CardHeader>
          <CardContent>
            {!growthSeries || growthSeries.every(g => g.novas === 0) ? (
              <div className="text-center py-10 text-muted-foreground">
                <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-xs">Nenhum cadastro nos últimos 14 dias</p>
              </div>
            ) : (
              <ChartContainer
                config={{ novas: { label: "Novas pessoas", color: "hsl(var(--primary))" } }}
                className="h-[200px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={growthSeries}>
                    <defs>
                      <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area type="monotone" dataKey="novas" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#growthGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Nível de apoio */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Termômetro de Apoio</CardTitle>
            </div>
            <CardDescription>Distribuição da base por nível de apoio</CardDescription>
          </CardHeader>
          <CardContent>
            {!nivelApoio || nivelApoio.every(n => n.count === 0) ? (
              <div className="text-center py-10 text-muted-foreground">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-xs">Sem pessoas cadastradas</p>
              </div>
            ) : (
              <ChartContainer
                config={{ count: { label: "Pessoas", color: "hsl(var(--primary))" } }}
                className="h-[200px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={nivelApoio.filter(n => n.count > 0).map(n => ({
                        name: NIVEL_LABEL[n.nivel],
                        value: n.count,
                        fill: NIVEL_COLORS[n.nivel],
                      }))}
                      cx="50%" cy="50%" outerRadius={75} dataKey="value"
                      label={({ name, percent }) => percent > 0.05 ? `${name}: ${(percent * 100).toFixed(0)}%` : ''}
                      labelLine={false}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Top líderes + Aniversariantes ── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top líderes */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Top Líderes por Equipe</CardTitle>
            </div>
            <CardDescription>Quem mais lidera contratados ativos</CardDescription>
          </CardHeader>
          <CardContent>
            {!topLideres || topLideres.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Crown className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-xs">Nenhum líder com equipe ainda</p>
                <Link to="/contratados" className="text-xs text-primary hover:underline mt-2 inline-block">
                  Cadastrar líderes →
                </Link>
              </div>
            ) : (
              <ChartContainer
                config={{ liderados: { label: "Liderados", color: "hsl(var(--primary))" } }}
                className="h-[200px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topLideres} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis type="category" dataKey="nome" stroke="hsl(var(--muted-foreground))" fontSize={11} width={75} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="liderados" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Aniversariantes hoje */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Cake className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Aniversariantes Hoje</CardTitle>
            </div>
            <CardDescription>Oportunidade de relacionamento</CardDescription>
          </CardHeader>
          <CardContent>
            {!aniversariantes || aniversariantes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Cake className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-xs">Ninguém faz aniversário hoje</p>
              </div>
            ) : (
              <ul className="divide-y divide-border max-h-[200px] overflow-y-auto">
                {aniversariantes.slice(0, 8).map((p: any) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <Cake className="w-4 h-4 text-primary" />
                      <Link to={`/pessoas/${p.id}`} className="text-sm hover:underline truncate max-w-[180px]">
                        {p.nome}
                      </Link>
                    </div>
                    <Badge variant="outline" className="text-[10px]">🎉 Hoje</Badge>
                  </li>
                ))}
                {aniversariantes.length > 8 && (
                  <li className="text-[10px] text-muted-foreground text-center pt-2">
                    +{aniversariantes.length - 8} aniversariantes
                  </li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Insights acionáveis ── */}
      <ActionableInsights clientId={clientId} kpis={kpis} />
    </div>
  );
}

// ───── Insights acionáveis ─────
function ActionableInsights({ clientId, kpis }: { clientId: string; kpis: any }) {
  // Líderes sem check-in há 3+ dias
  const { data: lideresAusentes } = useQuery({
    queryKey: ["insight-lideres-ausentes", clientId],
    queryFn: async () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const sinceDate = threeDaysAgo.toISOString().split("T")[0];

      const { data: contratados } = await supabase
        .from("contratados")
        .select("id, nome")
        .eq("client_id", clientId)
        .eq("status", "ativo")
        .eq("presenca_obrigatoria", true);

      if (!contratados || contratados.length === 0) return [];

      const ids = contratados.map((c: any) => c.id);
      const { data: recentes } = await supabase
        .from("contratado_checkins")
        .select("contratado_id")
        .eq("client_id", clientId)
        .in("contratado_id", ids)
        .gte("checkin_date", sinceDate);

      const comCheckin = new Set((recentes || []).map((r: any) => r.contratado_id));
      return contratados.filter((c: any) => !comCheckin.has(c.id)).slice(0, 5);
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 5,
  });

  // Pessoas sem interação há 30+ dias
  const { data: pessoasFrias } = useQuery({
    queryKey: ["insight-pessoas-frias", clientId],
    queryFn: async () => {
      const thirtyAgo = new Date();
      thirtyAgo.setDate(thirtyAgo.getDate() - 30);
      const { count } = await supabase
        .from("pessoas")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .lt("updated_at", thirtyAgo.toISOString());
      return count || 0;
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 5,
  });

  const insights: { icon: any; color: string; titulo: string; desc: string; link?: string; cta?: string }[] = [];

  if (lideresAusentes && lideresAusentes.length > 0) {
    insights.push({
      icon: AlertTriangle,
      color: "text-destructive",
      titulo: `${lideresAusentes.length} contratado(s) sem check-in há 3+ dias`,
      desc: lideresAusentes.map((l: any) => l.nome).join(", "),
      link: "/controle-presenca",
      cta: "Ver presença",
    });
  }
  if (kpis?.indicadosPendentes > 0) {
    insights.push({
      icon: PhoneCall,
      color: "text-amber-600",
      titulo: `${kpis.indicadosPendentes} indicados aguardando ligação`,
      desc: "Faça contato e qualifique a base.",
      link: "/telemarketing",
      cta: "Abrir telemarketing",
    });
  }
  if (pessoasFrias && pessoasFrias > 0) {
    insights.push({
      icon: MessageCircle,
      color: "text-blue-600",
      titulo: `${pessoasFrias} pessoas sem contato há 30+ dias`,
      desc: "Reative com mensagem ou ação no CRM.",
      link: "/pessoas",
      cta: "Reativar",
    });
  }
  if (kpis && kpis.pessoasTotal > 0 && kpis.pessoasComprometidas / kpis.pessoasTotal < 0.1) {
    insights.push({
      icon: Sparkles,
      color: "text-primary",
      titulo: "Base com baixo nível de comprometimento",
      desc: `Apenas ${Math.round((kpis.pessoasComprometidas / kpis.pessoasTotal) * 100)}% comprometidos. Crie missões para engajar.`,
      link: "/missoes-ia",
      cta: "Criar missão",
    });
  }

  if (insights.length === 0) return null;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <CardTitle className="text-base">Próximas Ações Recomendadas</CardTitle>
        </div>
        <CardDescription>Insights baseados no estado atual da campanha</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {insights.map((ins, i) => {
            const Icon = ins.icon;
            return (
              <li key={i} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
                <div className="flex items-start gap-3 min-w-0">
                  <Icon className={`w-5 h-5 ${ins.color} shrink-0 mt-0.5`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{ins.titulo}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{ins.desc}</p>
                  </div>
                </div>
                {ins.link && ins.cta && (
                  <Link to={ins.link} className="shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline whitespace-nowrap">
                    {ins.cta}
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}