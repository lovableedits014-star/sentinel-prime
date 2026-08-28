import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Loader2, Phone, CheckCircle2, Clock, TrendingUp, Users, Headphones, ArrowRight, BarChart3, Settings as SettingsIcon } from "lucide-react";
import TelemarketingSubNav from "@/components/telemarketing/TelemarketingSubNav";
import { useContratadosData } from "@/components/contratados/useContratadosData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export default function TelemarketingAdmin() {
  const { contratados, indicados, loading } = useContratadosData();

  const all = useMemo(() => {
    return [
      ...contratados.map((c: any) => ({
        ligacao_status: c.ligacao_status as string | null,
        vota_candidato: c.vota_candidato as string | null,
        operador_nome: c.operador_nome as string | null,
        ligacao_em: c.ligacao_em as string | null,
      })),
      ...indicados.map((i: any) => ({
        ligacao_status: i.ligacao_status as string | null,
        vota_candidato: i.vota_candidato as string | null,
        operador_nome: i.operador_nome as string | null,
        ligacao_em: i.ligacao_em as string | null,
      })),
    ];
  }, [contratados, indicados]);

  const now = Date.now();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const totalContatos = all.length;
  const ligados = all.filter((r) => r.ligacao_status && r.ligacao_status !== "pendente");
  const pendentes = totalContatos - ligados.length;
  const ligadosHoje = ligados.filter((r) => r.ligacao_em && new Date(r.ligacao_em).getTime() >= todayStart.getTime());
  const atendeuHoje = ligadosHoje.filter((r) => r.ligacao_status === "atendeu").length;
  const votaSimHoje = ligadosHoje.filter((r) => r.vota_candidato === "sim").length;
  const taxaAtendimento = ligadosHoje.length > 0 ? Math.round((atendeuHoje / ligadosHoje.length) * 100) : 0;
  const taxaConversao = atendeuHoje > 0 ? Math.round((votaSimHoje / atendeuHoje) * 100) : 0;

  // Operadores ativos (atividade nos últimos 30 min)
  const ACTIVE_MS = 30 * 60 * 1000;
  const operadoresAtivos = useMemo(() => {
    const map = new Map<string, { ultima: number; ligacoes: number }>();
    ligados.forEach((r) => {
      if (!r.operador_nome || !r.ligacao_em) return;
      const t = new Date(r.ligacao_em).getTime();
      const cur = map.get(r.operador_nome);
      if (!cur) map.set(r.operador_nome, { ultima: t, ligacoes: 1 });
      else map.set(r.operador_nome, { ultima: Math.max(cur.ultima, t), ligacoes: cur.ligacoes + 1 });
    });
    return Array.from(map.entries())
      .map(([nome, v]) => ({ nome, ...v, online: now - v.ultima < ACTIVE_MS }))
      .sort((a, b) => b.ligacoes - a.ligacoes);
  }, [ligados]);

  const operadoresOnline = operadoresAtivos.filter((o) => o.online).length;

  // Heatmap por hora (últimos 7 dias)
  const heatmap = useMemo(() => {
    const counts = new Array(24).fill(0);
    const sevenAgo = now - 7 * 24 * 3600 * 1000;
    ligados.forEach((r) => {
      if (!r.ligacao_em) return;
      const t = new Date(r.ligacao_em).getTime();
      if (t < sevenAgo) return;
      counts[new Date(r.ligacao_em).getHours()]++;
    });
    const max = Math.max(1, ...counts);
    return counts.map((c) => ({ count: c, pct: c / max }));
  }, [ligados]);

  if (loading) return (
    <div className="p-4 md:p-6">
      <TelemarketingSubNav />
      <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
    </div>
  );

  return (
    <div className="p-4 md:p-6">
      <TelemarketingSubNav />

      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Headphones className="w-6 h-6 text-primary" /> Central de Telemarketing
          </h1>
          <p className="text-sm text-muted-foreground">
            Painel administrativo: visão geral, fila ao vivo, resultados, relatórios e cadastro de operadores.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/telemarketing-admin/filas"><Phone className="w-4 h-4 mr-1" /> Gerenciar filas</Link>
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Phone className="w-3 h-3" /> Ligações hoje</div>
          <p className="text-2xl font-bold">{ligadosHoje.length}</p>
          <p className="text-[10px] text-muted-foreground">{atendeuHoje} atendidas ({taxaAtendimento}%)</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Clock className="w-3 h-3" /> Na fila</div>
          <p className="text-2xl font-bold text-amber-500">{pendentes}</p>
          <p className="text-[10px] text-muted-foreground">de {totalContatos} contatos totais</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><CheckCircle2 className="w-3 h-3" /> Votos confirmados hoje</div>
          <p className="text-2xl font-bold text-green-600">{votaSimHoje}</p>
          <p className="text-[10px] text-muted-foreground">{taxaConversao}% dos atendidos</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Users className="w-3 h-3" /> Operadores online</div>
          <p className="text-2xl font-bold">{operadoresOnline}</p>
          <p className="text-[10px] text-muted-foreground">{operadoresAtivos.length} cadastrados ativos</p>
        </CardContent></Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {/* Top operadores */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> Top operadores</CardTitle>
          </CardHeader>
          <CardContent>
            {operadoresAtivos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma ligação registrada ainda.</p>
            ) : (
              <div className="space-y-2">
                {operadoresAtivos.slice(0, 8).map((o) => (
                  <div key={o.nome} className="flex items-center justify-between gap-2 p-2 rounded-lg border bg-muted/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${o.online ? "bg-green-500 animate-pulse" : "bg-muted-foreground/30"}`} />
                      <p className="text-sm font-medium truncate">{o.nome}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className="text-[10px]">{o.ligacoes} ligações</Badge>
                      {o.online && <Badge variant="default" className="text-[10px]">online</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Heatmap */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> Atendimento por hora (7d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-12 gap-1">
              {HOURS.map((h) => (
                <div key={h} className="flex flex-col items-center gap-1" title={`${h}h — ${heatmap[h].count} ligações`}>
                  <div
                    className="w-full rounded-sm"
                    style={{
                      height: 36,
                      background: `color-mix(in oklab, hsl(var(--primary)) ${Math.round(heatmap[h].pct * 100)}%, transparent)`,
                      border: "1px solid hsl(var(--border))",
                    }}
                  />
                  <span className="text-[9px] text-muted-foreground">{h}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">Concentração das ligações nos últimos 7 dias por hora do dia.</p>
          </CardContent>
        </Card>
      </div>

      {/* Atalhos */}
      <div className="grid sm:grid-cols-3 gap-3">
        {[
          { to: "/telemarketing-admin/operadores", label: "Cadastrar / editar operadores", icon: Users },
          { to: "/telemarketing-admin/relatorios", label: "Ver relatórios completos", icon: BarChart3 },
          { to: "/telemarketing-admin/configuracoes", label: "Configurações & link público", icon: SettingsIcon },
        ].map((s) => (
          <Link key={s.to} to={s.to} className="border rounded-lg p-3 hover:bg-muted/40 transition flex items-center justify-between gap-2 group">
            <div className="flex items-center gap-2">
              <s.icon className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">{s.label}</span>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition" />
          </Link>
        ))}
      </div>
    </div>
  );
}
