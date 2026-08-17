import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, Users, UserCheck, DollarSign, TrendingUp, Handshake } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid } from "recharts";
import { useCandidatosParceiros, type CandidatoParceiro } from "@/hooks/useCandidatosParceiros";

type Tipo = "coordenador" | "lider" | "cabo";
type Escopo = "campo_grande" | "interior";

interface Pessoa {
  id: string;
  tipo: Tipo;
  escopo: Escopo;
  regiao: string | null;
  cidade: string | null;
  nome: string;
  parent_id?: string | null;
  valor_contratacao?: number | null;
  parceiro_id?: string | null;
  rateio_estadual?: number | null;
  rateio_parceiro?: number | null;
  is_voluntario?: boolean | null;

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

const COR_ESTADUAL = "#7c3aed";

export default function PrevisaoCustos({ pessoas, clientId }: { pessoas: Pessoa[]; clientId?: string }) {
  const { parceiros } = useCandidatosParceiros(clientId);
  const [filtroCandidato, setFiltroCandidato] = useState<string>("todos"); // 'todos' | 'estadual' | parceiro_id
  const [filtroEfetivacao, setFiltroEfetivacao] = useState<"todos" | "confirmados">("todos");

  // Mapa de parceiros por id
  const parceiroById = useMemo(() => {
    const m: Record<string, CandidatoParceiro> = {};
    parceiros.forEach(p => { m[p.id] = p; });
    return m;
  }, [parceiros]);

  const data = useMemo(() => {
    const valor = (p: Pessoa) => Number(p.valor_contratacao || 0);
    const parteEstadual = (p: Pessoa) => valor(p) * Number(p.rateio_estadual ?? 100) / 100;
    const parteParceiro = (p: Pessoa) => valor(p) * Number(p.rateio_parceiro ?? 0) / 100;

    // Valor que conta dado o filtro (parte do total que cabe ao candidato filtrado)
    const valorFiltrado = (p: Pessoa) => {
      if (filtroCandidato === "todos") return valor(p);
      if (filtroCandidato === "estadual") return parteEstadual(p);
      // filtro = parceiro_id específico
      return p.parceiro_id === filtroCandidato ? parteParceiro(p) : 0;
    };

    // Pessoas relevantes ao filtro
    const pessoasBase = filtroEfetivacao === "confirmados" 
      ? pessoas.filter(p => p.status_contratacao === "confirmado")
      : pessoas;

    const pessoasFiltradas = pessoasBase.filter(p => valorFiltrado(p) > 0 || filtroCandidato === "todos");

    // === Breakdown por candidato pagador (sempre calculado, ignora filtro) ===
    const porCandidato: Array<{
      key: string;
      label: string;
      cor: string;
      total: number;
      pessoas: number;
    }> = [];
    const estadualTotal = pessoasBase.reduce((s, p) => s + parteEstadual(p), 0);
    const estadualPessoas = pessoasBase.filter(p => parteEstadual(p) > 0).length;
    porCandidato.push({
      key: "estadual",
      label: "Estadual (principal)",
      cor: COR_ESTADUAL,
      total: estadualTotal,
      pessoas: estadualPessoas,
    });
    parceiros.forEach(parc => {
      const ps = pessoasBase.filter(p => p.parceiro_id === parc.id);
      const total = ps.reduce((s, p) => s + parteParceiro(p), 0);
      const pessoasCount = ps.filter(p => parteParceiro(p) > 0).length;
      porCandidato.push({
        key: parc.id,
        label: parc.nome + (parc.partido ? ` (${parc.partido})` : ""),
        cor: parc.cor,
        total,
        pessoas: pessoasCount,
      });
    });
    const totalGeralBruto = porCandidato.reduce((s, x) => s + x.total, 0);

    // === Métricas afetadas pelo filtro ===
    const byTipo = (t: Tipo) => pessoasFiltradas.filter(p => p.tipo === t);
    const porTipo = (["coordenador", "lider", "cabo"] as Tipo[]).map(t => {
      const list = byTipo(t);
      const semVoluntarios = list.filter(p => !p.is_voluntario);
      const total = semVoluntarios.reduce((s, p) => s + valorFiltrado(p), 0);
      const pagos = semVoluntarios.filter(p => valorFiltrado(p) > 0).length;
      const voluntarios = list.filter(p => p.is_voluntario).length;
      const avulsos = t === "lider" ? list.filter(p => !p.parent_id && !p.is_voluntario) : [];
      const avulsosTotal = avulsos.reduce((s, p) => s + valorFiltrado(p), 0);
      return {
        tipo: t,
        label: TIPO_LABEL[t],
        total,
        qtd: list.length,
        pagos,
        gratis: list.length - pagos - voluntarios,
        voluntarios,
        media: pagos > 0 ? total / pagos : 0,
        avulsosQtd: avulsos.length,
        avulsosTotal,
      };
    });

    const totalGeral = porTipo.reduce((s, x) => s + x.total, 0);

    // Por escopo
    const porEscopo = (["campo_grande", "interior"] as Escopo[]).map(e => ({
      escopo: e === "campo_grande" ? "Campo Grande" : "Interior",
      total: pessoasFiltradas.filter(p => p.escopo === e).reduce((s, p) => s + valorFiltrado(p), 0),
    }));

    // Top 10
    const top = [...pessoasFiltradas]
      .filter(p => valorFiltrado(p) > 0)
      .sort((a, b) => valorFiltrado(b) - valorFiltrado(a))
      .slice(0, 10)
      .map(p => ({ nome: p.nome, valor: valorFiltrado(p), tipo: p.tipo, parceiro_id: p.parceiro_id }));

    // Por região/cidade
    const agrupado: Record<string, number> = {};
    pessoasFiltradas.forEach(p => {
      const key = p.escopo === "campo_grande" ? p.regiao || "Sem região" : p.cidade || "Sem cidade";
      agrupado[key] = (agrupado[key] || 0) + valorFiltrado(p);
    });
    const porRegiao = Object.entries(agrupado)
      .filter(([, v]) => v > 0)
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total);

    // === Tabela "Quem paga quem" — só quando há dobradinhas ===
    const dobradinhas = pessoasBase
      .filter(p => p.parceiro_id && (parteParceiro(p) > 0 || parteEstadual(p) > 0) && valor(p) > 0)
      .sort((a, b) => valor(b) - valor(a));

    return { porTipo, totalGeral, porEscopo, top, porRegiao, porCandidato, totalGeralBruto, dobradinhas, pessoasFiltradas, totalConfirmados: pessoas.filter(p => p.status_contratacao === 'confirmado').length };
  }, [pessoas, parceiros, filtroCandidato, filtroEfetivacao]);

  const filtroLabel =
    filtroCandidato === "todos" ? "Custo total previsto" :
    filtroCandidato === "estadual" ? "Custo do Estadual (principal)" :
    `Custo do ${parceiroById[filtroCandidato]?.nome || "parceiro"}`;

  return (
    <div className="space-y-4">
      {/* === Cards por candidato pagador === */}
      {parceiros.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Handshake className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">Custos por candidato (dobradinhas)</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {data.porCandidato.map(c => {
              const pct = data.totalGeralBruto > 0 ? (c.total / data.totalGeralBruto) * 100 : 0;
              const ativo = filtroCandidato === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setFiltroCandidato(ativo ? "todos" : c.key)}
                  className="text-left rounded-lg border p-3 transition-all hover:shadow-md"
                  style={{
                    borderColor: ativo ? c.cor : undefined,
                    borderWidth: ativo ? 2 : 1,
                    backgroundColor: ativo ? `${c.cor}10` : undefined,
                  }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.cor }} />
                    <span className="text-sm font-medium truncate">{c.label}</span>
                  </div>
                  <p className="text-xl font-bold tabular-nums">{fmt(c.total)}</p>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
                    <span>{c.pessoas} {c.pessoas === 1 ? "pessoa" : "pessoas"}</span>
                    <span>{pct.toFixed(1)}% do total</span>
                  </div>
                </button>
              );
            })}
          </div>
          {filtroCandidato !== "todos" && (
            <div className="mt-3 flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                Filtros abaixo mostram apenas <strong>{filtroLabel.toLowerCase()}</strong>.
              </span>
              <Button size="sm" variant="ghost" onClick={() => setFiltroCandidato("todos")}>
                Limpar filtro
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Total geral (respeita filtro) */}
      <Card className="p-5 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] uppercase text-muted-foreground font-semibold">Exibir Custos</Label>
              <div className="flex bg-background/50 p-0.5 rounded-lg border border-primary/20">
                <button
                  onClick={() => setFiltroEfetivacao("todos")}
                  className={cn(
                    "px-3 py-1 text-[10px] font-medium rounded-md transition-all",
                    filtroEfetivacao === "todos" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-primary/10"
                  )}
                >
                  Projetado (Total)
                </button>
                <button
                  onClick={() => setFiltroEfetivacao("confirmados")}
                  className={cn(
                    "px-3 py-1 text-[10px] font-medium rounded-md transition-all",
                    filtroEfetivacao === "confirmados" ? "bg-emerald-600 text-white shadow-sm" : "text-muted-foreground hover:bg-emerald-500/10"
                  )}
                >
                  Real (Confirmados)
                </button>
              </div>
            </div>
            <div className="w-px h-8 bg-primary/20 hidden sm:block mx-1" />
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                  {filtroLabel} {filtroEfetivacao === "confirmados" && "(Apenas Confirmados)"}
                </p>
                <p className="text-3xl font-bold tabular-nums">{fmt(data.totalGeral)}</p>
              </div>
            </div>
          </div>
          <div className="flex gap-4 text-right">
            <div>
              <p className="text-xs text-muted-foreground">Voluntários</p>
              <p className="text-lg font-semibold text-primary">
                {data.porTipo.reduce((s, x) => s + x.voluntarios, 0)}
              </p>
            </div>
            <div className="border-l border-primary/20 pl-4">
              <p className="text-xs text-muted-foreground">Pessoas com pagamento</p>
              <p className="text-lg font-semibold">
                {data.porTipo.reduce((s, x) => s + x.pagos, 0)}
                <span className="text-muted-foreground text-sm font-normal">
                  {" "}/ {data.pessoasFiltradas.length}
                </span>
              </p>
            </div>
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
              <div className="flex flex-col gap-1 mt-2 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>{item.pagos} pagos · {item.gratis} s/ custo</span>
                  {item.voluntarios > 0 && (
                    <span className="text-primary font-medium flex items-center gap-0.5">
                      <span className="w-1 h-1 rounded-full bg-primary" />
                      {item.voluntarios} volunt.
                    </span>
                  )}
                </div>
                {item.media > 0 && <span className="text-right italic">Média {fmt(item.media)}</span>}
              </div>
              {item.tipo === "lider" && item.avulsosQtd > 0 && (
                <div className="mt-2 pt-2 border-t border-dashed border-border/60 text-[11px] text-muted-foreground flex items-center justify-between">
                  <span>↳ dos quais <strong className="text-foreground">avulsos</strong> (sem coordenador): {item.avulsosQtd}</span>
                  <span className="tabular-nums">{fmt(item.avulsosTotal)}</span>
                </div>
              )}
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
                {p.parceiro_id && parceiroById[p.parceiro_id] && (
                  <Badge variant="outline" className="text-[10px]" style={{ borderColor: parceiroById[p.parceiro_id].cor, color: parceiroById[p.parceiro_id].cor }}>
                    {parceiroById[p.parceiro_id].nome.split(" ")[0]}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground capitalize hidden sm:inline">{TIPO_LABEL[p.tipo]}</span>
                <span className="text-sm font-bold tabular-nums">{fmt(p.valor)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tabela "Quem paga quem" — dobradinhas detalhadas */}
      {data.dobradinhas.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Handshake className="w-4 h-4 text-primary" />
            <p className="font-medium text-sm">Quem paga quem — detalhamento das dobradinhas</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground border-b">
                <tr>
                  <th className="text-left py-2 px-2 font-medium">Pessoa</th>
                  <th className="text-left py-2 px-2 font-medium">Parceiro</th>
                  <th className="text-right py-2 px-2 font-medium">Valor total</th>
                  <th className="text-right py-2 px-2 font-medium" style={{ color: COR_ESTADUAL }}>Estadual paga</th>
                  <th className="text-right py-2 px-2 font-medium">Federal paga</th>
                </tr>
              </thead>
              <tbody>
                {data.dobradinhas.map(p => {
                  const total = Number(p.valor_contratacao || 0);
                  const est = total * Number(p.rateio_estadual ?? 100) / 100;
                  const par = total * Number(p.rateio_parceiro ?? 0) / 100;
                  const parc = p.parceiro_id ? parceiroById[p.parceiro_id] : null;
                  return (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-2 px-2">
                        <div className="font-medium truncate">{p.nome}</div>
                        <div className="text-[10px] text-muted-foreground capitalize">{TIPO_LABEL[p.tipo]} · {p.regiao || p.cidade}</div>
                      </td>
                      <td className="py-2 px-2">
                        {parc ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: parc.cor }} />
                            {parc.nome}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="text-right py-2 px-2 tabular-nums font-medium">{fmt(total)}</td>
                      <td className="text-right py-2 px-2 tabular-nums" style={{ color: COR_ESTADUAL }}>
                        {fmt(est)} <span className="text-[10px] text-muted-foreground">({p.rateio_estadual ?? 100}%)</span>
                      </td>
                      <td className="text-right py-2 px-2 tabular-nums" style={{ color: parc?.cor }}>
                        {fmt(par)} <span className="text-[10px] text-muted-foreground">({p.rateio_parceiro ?? 0}%)</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
