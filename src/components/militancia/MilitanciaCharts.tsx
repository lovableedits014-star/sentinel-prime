import { useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BADGE_META } from "@/lib/militant-badges";
import { getSocialProfileUrl } from "@/lib/social-url";
import { ExternalLink } from "lucide-react";
import type { MilitantRow } from "@/hooks/useMilitants";

const SENTIMENT_COLORS = {
  positive: "hsl(142, 71%, 45%)",
  negative: "hsl(0, 72%, 51%)",
  neutral: "hsl(220, 9%, 60%)",
};

const BADGE_COLORS: Record<string, string> = {
  hater: "hsl(0, 72%, 51%)",
  critico: "hsl(25, 90%, 55%)",
  sumido: "hsl(220, 9%, 60%)",
  elite: "hsl(270, 65%, 60%)",
  defensor: "hsl(142, 71%, 45%)",
  engajado: "hsl(217, 90%, 60%)",
  novo: "hsl(190, 80%, 50%)",
  observador: "hsl(220, 9%, 70%)",
};

interface Props {
  militants: MilitantRow[];
  platform: "facebook" | "instagram";
}

export function MilitanciaCharts({ militants, platform }: Props) {
  const list = useMemo(() => militants.filter(m => m.platform === platform), [militants, platform]);

  const badgeData = useMemo(() => {
    const counts: Record<string, number> = {};
    list.forEach(m => {
      const b = m.current_badge || "observador";
      counts[b] = (counts[b] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([key, value]) => ({
        key,
        name: `${BADGE_META[key as keyof typeof BADGE_META]?.emoji || ""} ${BADGE_META[key as keyof typeof BADGE_META]?.label || key}`,
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [list]);

  const sentimentTotals = useMemo(() => {
    const totals = list.reduce(
      (acc, m) => {
        acc.positive += m.total_positive || 0;
        acc.negative += m.total_negative || 0;
        acc.neutral += m.total_neutral || 0;
        return acc;
      },
      { positive: 0, negative: 0, neutral: 0 }
    );
    return [
      { name: "Positivos", value: totals.positive, color: SENTIMENT_COLORS.positive },
      { name: "Negativos", value: totals.negative, color: SENTIMENT_COLORS.negative },
      { name: "Neutros", value: totals.neutral, color: SENTIMENT_COLORS.neutral },
    ];
  }, [list]);

  const topActive = useMemo(() => {
    return [...list]
      .sort((a, b) => (b.total_comments || 0) - (a.total_comments || 0))
      .slice(0, 10)
      .map(m => ({
        name: (m.author_name || "—").slice(0, 18),
        comentários: m.total_comments,
        positivos: m.total_positive,
        negativos: m.total_negative,
        url: getSocialProfileUrl(m.platform, m.platform_user_id),
        fullName: m.author_name || "—",
      }));
  }, [list]);

  const newFacesTimeline = useMemo(() => {
    const days: Record<string, number> = {};
    const now = Date.now();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const k = d.toISOString().slice(0, 10);
      days[k] = 0;
    }
    list.forEach(m => {
      const k = (m.first_seen_at || "").slice(0, 10);
      if (k in days) days[k]++;
    });
    return Object.entries(days).map(([date, value]) => ({
      date: date.slice(5),
      novos: value,
    }));
  }, [list]);

  if (list.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Sem dados suficientes para gerar gráficos. Aguarde novos comentários serem sincronizados.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Distribuição de selos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Distribuição por Selo</CardTitle>
          <p className="text-xs text-muted-foreground">Como sua base está categorizada hoje.</p>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={badgeData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={140} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {badgeData.map((d) => (
                  <Cell key={d.key} fill={BADGE_COLORS[d.key] || "hsl(var(--primary))"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Pizza de sentimento */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Sentimento Acumulado</CardTitle>
          <p className="text-xs text-muted-foreground">Soma de todos os comentários classificados nesta plataforma.</p>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={sentimentTotals} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e: any) => `${e.name}: ${e.value}`} labelLine={false}>
                {sentimentTotals.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top 10 mais ativos */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Top 10 Perfis Mais Ativos</CardTitle>
          <p className="text-xs text-muted-foreground">Quem mais comenta nas suas publicações — barra dividida em positivos vs negativos. Clique no nome abaixo do gráfico para abrir o perfil.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topActive} margin={{ left: 0, right: 10, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="positivos" stackId="a" fill={SENTIMENT_COLORS.positive} radius={[0, 0, 0, 0]} />
              <Bar dataKey="negativos" stackId="a" fill={SENTIMENT_COLORS.negative} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-2 border-t">
            {topActive.map((p, i) => (
              p.url ? (
                <a
                  key={i}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-muted hover:bg-primary/10 hover:text-primary transition-colors"
                  title={`Abrir perfil de ${p.fullName}`}
                >
                  <span className="font-medium">#{i + 1}</span>
                  <span className="truncate max-w-[140px]">{p.fullName}</span>
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              ) : (
                <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-muted text-muted-foreground">
                  <span className="font-medium">#{i + 1}</span>
                  <span className="truncate max-w-[140px]">{p.fullName}</span>
                </span>
              )
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Timeline novos rostos */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Novos Rostos nos Últimos 30 dias</CardTitle>
          <p className="text-xs text-muted-foreground">Quantas pessoas novas começaram a interagir a cada dia. Picos costumam coincidir com posts de maior alcance.</p>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={newFacesTimeline} margin={{ left: 0, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Line type="monotone" dataKey="novos" stroke="hsl(190, 80%, 50%)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}