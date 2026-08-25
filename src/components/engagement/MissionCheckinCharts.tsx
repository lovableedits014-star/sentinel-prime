import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type Row = {
  cargo: string | null;
  regiao: string | null;
  status: "cumpriu" | "abriu" | "nao_abriu";
};

const CARGO_LABEL: Record<string, string> = {
  coordenador: "Coordenador",
  lider: "Líder",
  cabo: "Cabo",
  voluntario: "Voluntário",
  funcionario: "Funcionário",
  contratado: "Contratado",
};

const STATUS_COLORS = ["hsl(142 71% 40%)", "hsl(38 92% 50%)", "hsl(0 72% 51%)"];

export default function MissionCheckinCharts({
  clientId,
  missionId,
  rows,
}: {
  clientId: string;
  missionId: string;
  rows: Row[];
}) {
  const statusData = useMemo(() => {
    const cumpriu = rows.filter((r) => r.status === "cumpriu").length;
    const abriu = rows.filter((r) => r.status === "abriu").length;
    const nao = rows.length - cumpriu - abriu;
    return [
      { name: "Cumpriu", value: cumpriu },
      { name: "Abriu e não concluiu", value: abriu },
      { name: "Não abriu", value: nao },
    ];
  }, [rows]);

  const porCargo = useMemo(() => {
    const map = new Map<string, { nome: string; total: number; cumpriu: number }>();
    for (const r of rows) {
      const key = r.cargo || "outros";
      const cur = map.get(key) || { nome: CARGO_LABEL[key] || key, total: 0, cumpriu: 0 };
      cur.total += 1;
      if (r.status === "cumpriu") cur.cumpriu += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).map((g) => ({
      ...g,
      adesao: g.total ? Math.round((g.cumpriu / g.total) * 100) : 0,
    }));
  }, [rows]);

  const { data: serie = [] } = useQuery<{ hora: string; acessos: number; conclusoes: number }[]>({
    queryKey: ["mission-checkin-series", clientId, missionId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("mission_checkin_series", {
        p_client_id: clientId,
        p_mission_id: missionId,
      });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!clientId && !!missionId,
    staleTime: 30_000,
  });

  const { data: evolucao = [] } = useQuery<
    { mission_id: string; title: string | null; adesao: number; cumpriram: number; participantes: number }[]
  >({
    queryKey: ["mission-checkin-evolucao", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("mission_checkin_evolucao", {
        p_client_id: clientId,
        p_limit: 10,
      });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!clientId,
    staleTime: 60_000,
  });

  const serieFmt = serie.map((s) => ({
    ...s,
    label: new Date(s.hora).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit" }) + "h",
  }));

  const evolucaoFmt = evolucao.map((e) => ({
    ...e,
    label: (e.title || "Missão").slice(0, 18),
  }));

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Status dos obrigados</CardTitle>
          <CardDescription>Distribuição desta missão.</CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {statusData.map((_, i) => (
                  <Cell key={i} fill={STATUS_COLORS[i]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Adesão por cargo</CardTitle>
          <CardDescription>% de quem concluiu, por função na estrutura.</CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={porCargo}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip formatter={(v: any) => `${v}%`} />
              <Bar dataKey="adesao" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Quando as pessoas entram no link</CardTitle>
          <CardDescription>Use para escolher o melhor horário de disparo.</CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          {serieFmt.length === 0 ? (
            <p className="pt-16 text-center text-sm text-muted-foreground">Ainda sem acessos nesta missão.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serieFmt}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="acessos" name="Acessos" stroke="hsl(var(--primary))" strokeWidth={2} />
                <Line type="monotone" dataKey="conclusoes" name="Concluíram" stroke="hsl(142 71% 40%)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Evolução entre missões</CardTitle>
          <CardDescription>O time está melhorando ou caindo?</CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          {evolucaoFmt.length === 0 ? (
            <p className="pt-16 text-center text-sm text-muted-foreground">Sem missões suficientes ainda.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={evolucaoFmt}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v: any) => `${v}%`} />
                <Bar dataKey="adesao" name="Adesão" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
