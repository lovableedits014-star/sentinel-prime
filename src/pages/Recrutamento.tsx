import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, UserPlus, TrendingUp, CalendarDays, MapPin, BarChart3, Clock } from "lucide-react";
import { format, subDays, startOfDay, isAfter, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface PessoaRow {
  id: string;
  nome: string;
  cidade: string | null;
  bairro: string | null;
  telefone: string | null;
  tipo_pessoa: string;
  origem_contato: string;
  created_at: string;
}

export default function Recrutamento() {
  const [pessoas, setPessoas] = useState<PessoaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get client
      let cId: string | null = null;
      const { data: client } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (client) {
        cId = client.id;
      } else {
        const { data: tm } = await supabase
          .from("team_members")
          .select("client_id")
          .eq("user_id", session.user.id)
          .eq("status", "active")
          .maybeSingle();
        if (tm) cId = tm.client_id;
      }

      if (!cId) { setLoading(false); return; }
      setClientId(cId);

      // Fetch all pessoas for this client
      const allPessoas: PessoaRow[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data } = await supabase
          .from("pessoas")
          .select("id, nome, cidade, bairro, telefone, tipo_pessoa, origem_contato, created_at")
          .eq("client_id", cId)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        allPessoas.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      // Deduplicate by normalized name (case-insensitive, trimmed)
      const seenNames = new Set<string>();
      const dedup = (list: PessoaRow[]): PessoaRow[] => {
        const result: PessoaRow[] = [];
        for (const p of list) {
          const key = p.nome.trim().toLowerCase();
          if (!seenNames.has(key)) {
            seenNames.add(key);
            result.push(p);
          }
        }
        return result;
      };

      // Mark all pessoas names as seen first (they are the source of truth)
      const dedupedPessoas = dedup(allPessoas);

      // Fetch contratados (líderes + liderados)
      from = 0;
      const contratadoRows: PessoaRow[] = [];
      while (true) {
        const { data } = await supabase
          .from("contratados")
          .select("id, nome, cidade, bairro, telefone, is_lider, created_at")
          .eq("client_id", cId)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        for (const c of data) {
          contratadoRows.push({
            id: c.id, nome: c.nome, cidade: c.cidade, bairro: c.bairro,
            telefone: c.telefone, tipo_pessoa: c.is_lider ? "lider" : "contratado",
            origem_contato: "formulario", created_at: c.created_at,
          });
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
      const newContratados = dedup(contratadoRows);

      // Fetch indicados
      from = 0;
      const indicadoRows: PessoaRow[] = [];
      while (true) {
        const { data } = await supabase
          .from("contratado_indicados")
          .select("id, nome, cidade, bairro, telefone, created_at")
          .eq("client_id", cId)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        for (const ind of data) {
          indicadoRows.push({
            id: ind.id, nome: ind.nome, cidade: ind.cidade, bairro: ind.bairro,
            telefone: ind.telefone, tipo_pessoa: "indicado",
            origem_contato: "formulario", created_at: ind.created_at,
          });
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
      const newIndicados = dedup(indicadoRows);

      const merged = [...dedupedPessoas, ...newContratados, ...newIndicados];
      // Sort all by created_at descending
      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setPessoas(merged);
      setLoading(false);
    };
    load();
  }, []);

  const now = useMemo(() => new Date(), []);
  const todayStart = useMemo(() => startOfDay(now), [now]);
  const weekAgo = useMemo(() => subDays(todayStart, 7), [todayStart]);
  const monthAgo = useMemo(() => subDays(todayStart, 30), [todayStart]);

  const metrics = useMemo(() => {
    const total = pessoas.length;
    const today = pessoas.filter(p => isAfter(parseISO(p.created_at), todayStart)).length;
    const week = pessoas.filter(p => isAfter(parseISO(p.created_at), weekAgo)).length;
    const month = pessoas.filter(p => isAfter(parseISO(p.created_at), monthAgo)).length;
    const fromForm = pessoas.filter(p => p.origem_contato === "formulario").length;
    return { total, today, week, month, fromForm };
  }, [pessoas, todayStart, weekAgo, monthAgo]);

  // Chart data: cadastros por dia nos últimos 30 dias
  const chartData = useMemo(() => {
    const days: { date: string; label: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = subDays(todayStart, i);
      const key = format(d, "yyyy-MM-dd");
      days.push({ date: key, label: format(d, "dd/MM"), count: 0 });
    }
    pessoas.forEach(p => {
      const key = format(parseISO(p.created_at), "yyyy-MM-dd");
      const day = days.find(d => d.date === key);
      if (day) day.count++;
    });
    return days;
  }, [pessoas, todayStart]);

  // Distribuição por cidade
  const cidadeData = useMemo(() => {
    const map: Record<string, number> = {};
    pessoas.forEach(p => {
      const c = p.cidade?.trim() || "Não informado";
      map[c] = (map[c] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [pessoas]);

  // Distribuição por bairro
  const bairroData = useMemo(() => {
    const map: Record<string, number> = {};
    pessoas.forEach(p => {
      const b = p.bairro?.trim() || "Não informado";
      map[b] = (map[b] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [pessoas]);

  // Distribuição por origem
  const origemData = useMemo(() => {
    const map: Record<string, number> = {};
    pessoas.forEach(p => {
      map[p.origem_contato] = (map[p.origem_contato] || 0) + 1;
    });
    const labels: Record<string, string> = {
      formulario: "Formulário Público",
      manual: "Cadastro Manual",
      rede_social: "Rede Social",
      evento: "Evento",
      importacao: "Importação",
    };
    return Object.entries(map)
      .map(([key, count]) => ({ name: labels[key] || key, count }))
      .sort((a, b) => b.count - a.count);
  }, [pessoas]);

  // Últimos 20 cadastros
  const recentPessoas = useMemo(() => pessoas.slice(0, 20), [pessoas]);

  const tipoLabels: Record<string, string> = {
    eleitor: "Eleitor", apoiador: "Apoiador", lideranca: "Liderança",
    voluntario: "Voluntário", cidadao: "Cidadão", jornalista: "Jornalista",
    influenciador: "Influenciador", adversario: "Adversário",
    lider: "Líder", contratado: "Contratado", indicado: "Indicado", liderado: "Liderado",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const maxChart = Math.max(...chartData.map(d => d.count), 1);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Recrutamento</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Painel analítico de crescimento da base. Consolida dados de <strong>Pessoas</strong>, <strong>Contratados</strong>, <strong>Líderes</strong> e <strong>Indicados</strong> — todos os cadastros do sistema em uma única visão.
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <MetricCard icon={Users} label="Total de cadastros" value={metrics.total} />
        <MetricCard icon={UserPlus} label="Hoje" value={metrics.today} accent />
        <MetricCard icon={CalendarDays} label="Últimos 7 dias" value={metrics.week} />
        <MetricCard icon={TrendingUp} label="Últimos 30 dias" value={metrics.month} />
      </div>

      {/* Growth chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Cadastros por Dia — Últimos 30 dias</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-64 md:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  interval={window.innerWidth < 768 ? 3 : 1}
                  angle={-45}
                  textAnchor="end"
                  height={50}
                  className="fill-muted-foreground"
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} className="fill-muted-foreground" />
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 13, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))" }}
                  labelFormatter={(l) => `Dia ${l}`}
                  formatter={(v: number) => [`${v} cadastros`, "Cadastros"]}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={28}>
                  {chartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.count === 0 ? "hsl(var(--muted))" : entry.count >= maxChart * 0.7 ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.6)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Geographic + Origin */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Por Cidade */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm">Por Cidade</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {cidadeData.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum dado</p>
            ) : (
              <div className="space-y-2">
                {cidadeData.map((c) => (
                  <DistributionRow key={c.name} label={c.name} count={c.count} total={metrics.total} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Por Bairro */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-violet-500" />
              <CardTitle className="text-sm">Por Bairro</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {bairroData.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum dado</p>
            ) : (
              <div className="space-y-2">
                {bairroData.map((b) => (
                  <DistributionRow key={b.name} label={b.name} count={b.count} total={metrics.total} color="bg-violet-500" />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Origem */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-500" />
              <CardTitle className="text-sm">Origem dos Cadastros</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {origemData.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum dado</p>
            ) : (
              <div className="space-y-2">
                {origemData.map((o) => (
                  <DistributionRow key={o.name} label={o.name} count={o.count} total={metrics.total} color="bg-emerald-500" />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent registrations */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Últimos Cadastros</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {recentPessoas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum cadastro encontrado.</p>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pl-6 font-medium text-muted-foreground">Nome</th>
                    <th className="pb-2 font-medium text-muted-foreground hidden sm:table-cell">Cidade</th>
                    <th className="pb-2 font-medium text-muted-foreground hidden md:table-cell">Telefone</th>
                    <th className="pb-2 font-medium text-muted-foreground hidden md:table-cell">Tipo</th>
                    <th className="pb-2 pr-6 font-medium text-muted-foreground text-right">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPessoas.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="py-2.5 pl-6 font-medium">{p.nome}</td>
                      <td className="py-2.5 text-muted-foreground hidden sm:table-cell">{p.cidade || "—"}</td>
                      <td className="py-2.5 text-muted-foreground hidden md:table-cell font-mono text-xs">{p.telefone || "—"}</td>
                      <td className="py-2.5 hidden md:table-cell">
                        <Badge variant="secondary" className="text-xs">{tipoLabels[p.tipo_pessoa] || p.tipo_pessoa}</Badge>
                      </td>
                      <td className="py-2.5 pr-6 text-right text-muted-foreground text-xs">
                        {format(parseISO(p.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number; accent?: boolean }) {
  return (
    <Card className={accent ? "border-primary/30 bg-primary/5" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className={`w-4 h-4 ${accent ? "text-primary" : "text-muted-foreground"}`} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className={`text-2xl font-bold ${accent ? "text-primary" : ""}`}>{value.toLocaleString("pt-BR")}</p>
      </CardContent>
    </Card>
  );
}

function DistributionRow({ label, count, total, color = "bg-primary" }: { label: string; count: number; total: number; color?: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="truncate font-medium">{label}</span>
        <span className="text-muted-foreground shrink-0 ml-2">{count} ({pct.toFixed(0)}%)</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
    </div>
  );
}
