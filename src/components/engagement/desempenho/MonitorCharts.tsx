import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtData, type PessoaDesempenho, type PubKpis, type PublicacaoDesempenho } from "@/lib/engagement-desempenho";

const CARGO_LABEL: Record<string, string> = {
  coordenador: "Coordenador",
  lider: "Líder",
  cabo: "Cabo",
  voluntario: "Voluntário",
  funcionario: "Funcionário",
  contratado: "Contratado",
};

const PROVA_COLORS = ["hsl(142 71% 40%)", "hsl(217 91% 60%)", "hsl(271 76% 53%)"];

export default function MonitorCharts({
  kpis, publicacoes, pessoas,
}: {
  kpis: PubKpis | null;
  publicacoes: PublicacaoDesempenho[];
  pessoas: PessoaDesempenho[];
}) {
  const evolucao = useMemo(
    () =>
      [...publicacoes]
        .sort((a, b) => new Date(a.publicado_em || 0).getTime() - new Date(b.publicado_em || 0).getTime())
        .map((p) => ({
          nome: fmtData(p.publicado_em),
          titulo: p.titulo || "Publicação",
          adesao: Number(p.adesao),
          cumpriram: p.cumpriram,
        })),
    [publicacoes],
  );

  const provas = useMemo(
    () => [
      { name: "E1 · Comprovado", value: kpis?.e1 ?? 0 },
      { name: "E2 · Declarado", value: kpis?.e2 ?? 0 },
      { name: "E3 · Evidência", value: kpis?.e3 ?? 0 },
    ],
    [kpis],
  );

  const agrupar = (chave: (p: PessoaDesempenho) => string) => {
    const map = new Map<string, { nome: string; obrig: number; cump: number }>();
    for (const p of pessoas) {
      const key = chave(p) || "—";
      const cur = map.get(key) || { nome: CARGO_LABEL[key] || key, obrig: 0, cump: 0 };
      cur.obrig += p.publicacoes;
      cur.cump += p.cumpridas;
      map.set(key, cur);
    }
    return Array.from(map.values())
      .map((g) => ({ ...g, adesao: g.obrig ? Math.round((g.cump / g.obrig) * 100) : 0 }))
      .sort((a, b) => b.adesao - a.adesao)
      .slice(0, 12);
  };

  const porCargo = useMemo(() => agrupar((p) => p.cargo || "outros"), [pessoas]);
  const porRegiao = useMemo(() => agrupar((p) => p.regiao || p.cidade || "sem região"), [pessoas]);

  const funil = useMemo(() => {
    const pares = kpis?.pares ?? 0;
    const cump = kpis?.cumprimentos ?? 0;
    const abriu = kpis?.abriu_sem_confirmar ?? 0;
    return [
      { etapa: "Obrigados", valor: pares },
      { etapa: "Abriram", valor: cump + abriu },
      { etapa: "Cumpriram", valor: cump },
    ];
  }, [kpis]);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <CardHeader className="px-3 pb-2 sm:px-6">
          <CardTitle className="text-base">Evolução da adesão por publicação</CardTitle>
          <CardDescription className="text-xs">Ordem cronológica das publicações do período.</CardDescription>
        </CardHeader>
        <CardContent className="px-1 sm:px-4">
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={evolucao}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="nome" fontSize={11} />
              <YAxis fontSize={11} domain={[0, 100]} unit="%" />
              <Tooltip
                formatter={(v: any, n: any) => (n === "adesao" ? [`${v}%`, "Adesão"] : [v, "Cumpriram"])}
                labelFormatter={(l, p) => (p?.[0]?.payload?.titulo ? `${p[0].payload.titulo} · ${l}` : String(l))}
              />
              <Line type="monotone" dataKey="adesao" stroke="hsl(142 71% 40%)" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-3 pb-2 sm:px-6">
          <CardTitle className="text-base">Cumprimento por tipo de prova</CardTitle>
          <CardDescription className="text-xs">Quanto você depende de declaração no portal (E2).</CardDescription>
        </CardHeader>
        <CardContent className="px-1 sm:px-4">
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={provas} dataKey="value" nameKey="name" outerRadius={80} label>
                {provas.map((_, i) => (
                  <Cell key={i} fill={PROVA_COLORS[i]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-3 pb-2 sm:px-6">
          <CardTitle className="text-base">Adesão por cargo</CardTitle>
        </CardHeader>
        <CardContent className="px-1 sm:px-4">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={porCargo}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="nome" fontSize={11} />
              <YAxis fontSize={11} domain={[0, 100]} unit="%" />
              <Tooltip formatter={(v: any) => [`${v}%`, "Adesão"]} />
              <Bar dataKey="adesao" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-3 pb-2 sm:px-6">
          <CardTitle className="text-base">Funil e adesão por região</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 px-1 sm:px-4 sm:grid-cols-2">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={funil} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis type="number" fontSize={11} />
              <YAxis type="category" dataKey="etapa" fontSize={11} width={80} />
              <Tooltip />
              <Bar dataKey="valor" fill="hsl(142 71% 40%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={porRegiao}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="nome" fontSize={10} interval={0} angle={-25} textAnchor="end" height={60} />
              <YAxis fontSize={11} domain={[0, 100]} unit="%" />
              <Tooltip formatter={(v: any) => [`${v}%`, "Adesão"]} />
              <Bar dataKey="adesao" fill="hsl(271 76% 53%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
