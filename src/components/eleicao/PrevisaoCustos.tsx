import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Crown, Users, UserCheck, DollarSign, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid } from "recharts";

type Tipo = "coordenador" | "lider" | "cabo";
type Escopo = "campo_grande" | "interior";

interface Pessoa {
  id: string;
  tipo: Tipo;
  escopo: Escopo;
  regiao: string | null;
  cidade: string | null;
  nome: string;
  valor_contratacao?: number | null;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const TIPO_LABEL: Record<Tipo, string> = {
  coordenador: "Coordenadores",
  lider: "Líderes",
  cabo: "Cabos Eleitorais",
};

const TIPO_COLOR: Record<Tipo, string> = {
  coordenador: "hsl(0 72% 51%)",
  lider: "hsl(217 91% 60%)",
  cabo: "hsl(142 71% 45%)",
};

const TIPO_ICON = {
  coordenador: Crown,
  lider: Users,
  cabo: UserCheck,
};

export default function PrevisaoCustos({ pessoas }: { pessoas: Pessoa[] }) {
  const data = useMemo(() => {
    const valor = (p: Pessoa) => Number(p.valor_contratacao || 0);
    const byTipo = (t: Tipo) => pessoas.filter(p => p.tipo === t);

    const porTipo = (["coordenador", "lider", "cabo"] as Tipo[]).map(t => {
      const list = byTipo(t);
      const total = list.reduce((s, p) => s + valor(p), 0);
      const pagos = list.filter(p => valor(p) > 0).length;
      return {
        tipo: t,
        label: TIPO_LABEL[t],
        total,
        qtd: list.length,
        pagos,
        gratis: list.length - pagos,
        media: pagos > 0 ? total / pagos : 0,
      };
    });

    const totalGeral = porTipo.reduce((s, x) => s + x.total, 0);

    // Por escopo
    const porEscopo = (["campo_grande", "interior"] as Escopo[]).map(e => ({
      escopo: e === "campo_grande" ? "Campo Grande" : "Interior",
      total: pessoas.filter(p => p.escopo === e).reduce((s, p) => s + valor(p), 0),
    }));

    // Top 10 mais caros
    const top = [...pessoas]
      .filter(p => valor(p) > 0)
      .sort((a, b) => valor(b) - valor(a))
      .slice(0, 10)
      .map(p => ({ nome: p.nome, valor: valor(p), tipo: p.tipo }));

    // Por região/cidade
    const agrupado: Record<string, number> = {};
    pessoas.forEach(p => {
      const key =
        p.escopo === "campo_grande"
          ? p.regiao || "Sem região"
          : p.cidade || "Sem cidade";
      agrupado[key] = (agrupado[key] || 0) + valor(p);
    });
    const porRegiao = Object.entries(agrupado)
      .filter(([, v]) => v > 0)
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total);

    return { porTipo, totalGeral, porEscopo, top, porRegiao };
  }, [pessoas]);

  return (
    <div className="space-y-4">
      {/* Total geral */}
      <Card className="p-5 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Custo total previsto</p>
              <p className="text-3xl font-bold tabular-nums">{fmt(data.totalGeral)}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Pessoas com pagamento</p>
            <p className="text-lg font-semibold">
              {data.porTipo.reduce((s, x) => s + x.pagos, 0)}
              <span className="text-muted-foreground text-sm font-normal">
                {" "}/ {pessoas.length}
              </span>
            </p>
          </div>
        </div>
      </Card>

      {/* Cards por tipo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {data.porTipo.map(item => {
          const Icon = TIPO_ICON[item.tipo];
          return (
            <Card key={item.tipo} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${TIPO_COLOR[item.tipo]}20`, color: TIPO_COLOR[item.tipo] }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <p className="font-medium text-sm">{item.label}</p>
                </div>
                <span className="text-xs text-muted-foreground">{item.qtd}</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{fmt(item.total)}</p>
              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                <span>{item.pagos} pagos · {item.gratis} sem custo</span>
                {item.media > 0 && <span>Média {fmt(item.media)}</span>}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="font-medium text-sm mb-3">Distribuição por tipo</p>
          {data.totalGeral > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={data.porTipo.filter(d => d.total > 0)}
                  dataKey="total"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(e: any) => `${e.label}: ${fmt(e.total)}`}
                >
                  {data.porTipo.filter(d => d.total > 0).map((d) => (
                    <Cell key={d.tipo} fill={TIPO_COLOR[d.tipo]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-12">Sem valores cadastrados ainda</p>
          )}
        </Card>

        <Card className="p-4">
          <p className="font-medium text-sm mb-3">Custo por escopo</p>
          {data.totalGeral > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.porEscopo}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="escopo" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-12">Sem valores cadastrados ainda</p>
          )}
        </Card>
      </div>

      {/* Por região/cidade */}
      {data.porRegiao.length > 0 && (
        <Card className="p-4">
          <p className="font-medium text-sm mb-3">Custo por região / cidade</p>
          <ResponsiveContainer width="100%" height={Math.max(220, data.porRegiao.length * 32)}>
            <BarChart data={data.porRegiao} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="nome" tick={{ fontSize: 12 }} width={120} />
              <Tooltip formatter={(v: any) => fmt(Number(v))} />
              <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Top 10 */}
      {data.top.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-primary" />
            <p className="font-medium text-sm">Top 10 maiores valores</p>
          </div>
          <div className="space-y-1.5">
            {data.top.map((p, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                <span className="text-xs text-muted-foreground w-5 tabular-nums">{i + 1}</span>
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: TIPO_COLOR[p.tipo] }}
                />
                <span className="text-sm font-medium flex-1 truncate">{p.nome}</span>
                <span className="text-xs text-muted-foreground capitalize">{TIPO_LABEL[p.tipo]}</span>
                <span className="text-sm font-bold tabular-nums">{fmt(p.valor)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
