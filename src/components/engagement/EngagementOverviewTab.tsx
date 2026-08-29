import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Filter, MessageCircle, Search, ShieldCheck, Target, TrendingUp, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { toWhatsAppBR } from "@/lib/phone-utils";
import { FAIXA_META, fetchAdesao, fetchEligibilityAudit, fetchMonitorOverview, fetchRanking, registrarCobranca, type Faixa, type RankingRow } from "@/lib/engagement-monitor";

type Props = { clientId: string; onNavigate: (tab: "publico" | "checkin" | "cobranca" | "monitoramento") => void };
type StatusFilter = "todos" | Faixa;
const fmtDate = (value: string | null) => value ? new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";
const unique = (values: Array<string | null>) => Array.from(new Set(values.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "pt-BR"));
const EMPTY_RANKING: RankingRow[] = [];

export default function EngagementOverviewTab({ clientId, onNavigate }: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("todos");
  const [cargo, setCargo] = useState("todos");
  const [regiao, setRegiao] = useState("todos");
  const [charging, setCharging] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["engagement-management-overview", clientId],
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [overview, ranking, missions, audit, newcomers] = await Promise.all([
        fetchMonitorOverview(clientId), fetchRanking(clientId, 500), fetchAdesao(clientId, 100), fetchEligibilityAudit(clientId),
        supabase.from("engagement_memberships" as never).select("id", { count: "exact", head: true }).eq("client_id", clientId).is("effective_until", null).gte("effective_from", sevenDaysAgo),
      ]);
      if (newcomers.error) throw new Error(newcomers.error.message);
      return { overview, ranking, missions, audit, newcomers: newcomers.count ?? 0 };
    },
    staleTime: 30_000,
  });
  const ranking = query.data?.ranking ?? EMPTY_RANKING;
  const cargos = useMemo(() => unique(ranking.map((row) => row.cargo)), [ranking]);
  const regioes = useMemo(() => unique(ranking.map((row) => row.regiao || row.cidade)), [ranking]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return ranking.filter((row) => (status === "todos" || row.faixa === status) && (cargo === "todos" || row.cargo === cargo)
      && (regiao === "todos" || (row.regiao || row.cidade) === regiao)
      && (!term || `${row.nome} ${row.telefone || ""}`.toLocaleLowerCase("pt-BR").includes(term)));
  }, [ranking, search, status, cargo, regiao]);
  const queue = useMemo(() => [...filtered].filter((row) => row.nao_cumpridas > 0 || row.faixa === "critico" || row.faixa === "baixo")
    .sort((a, b) => b.nao_cumpridas - a.nao_cumpridas || a.indice - b.indice), [filtered]);

  const charge = async (person: RankingRow) => {
    const phone = toWhatsAppBR(person.telefone || "");
    if (!phone) return toast.error("Esta pessoa não possui WhatsApp válido cadastrado.");
    const text = `Olá, ${person.nome}! Identificamos ${person.nao_cumpridas} missão(ões) de engajamento pendente(s). Sua participação é importante. Você consegue verificar as missões disponíveis?`;
    const key = `${person.origem}:${person.ref_id}`;
    setCharging(key);
    try {
      await registrarCobranca(clientId, person.origem, person.ref_id, "whatsapp", text);
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      toast.success("Cobrança registrada e WhatsApp aberto.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível registrar a cobrança."); }
    finally { setCharging(null); }
  };

  if (query.isLoading) return <Skeleton className="h-[620px] w-full" />;
  if (query.isError || !query.data) return <Card><CardContent className="py-10 text-center text-sm text-destructive">Não foi possível montar a visão gerencial. Atualize a página e tente novamente.</CardContent></Card>;
  const { overview, missions, audit, newcomers } = query.data;
  const corrected = audit.reduce((sum, row) => sum + row.dispensados_entrada_posterior, 0);
  const missionsAtRisk = missions.filter((row) => row.obrigacoes > 0 && row.adesao < 70);
  const active = Number(overview?.obrigacoes ?? 0), completed = Number(overview?.cumpridas ?? 0);
  const pending = Number(overview?.pendentes ?? 0), overdue = Number(overview?.nao_cumpridas ?? 0);
  const adherence = Number(overview?.cumprimento_geral ?? 0);
  const distribution = (["excelente", "atencao", "baixo", "critico"] as Faixa[]).map((faixa) => ({ faixa, count: ranking.filter((row) => row.faixa === faixa).length }));

  return <div className="space-y-5">
    <Card className="overflow-hidden border-0 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white shadow-xl"><CardContent className="relative p-6">
      <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-5"><div><Badge className="mb-3 border-white/15 bg-white/10 text-white hover:bg-white/10">Central de engajamento</Badge><h2 className="text-2xl font-bold tracking-tight">Painel de gestão e cobrança</h2><p className="mt-1 max-w-xl text-sm text-slate-300">Priorize contatos, acompanhe a adesão e tome decisões por segmento.</p></div>
        <div className="min-w-48"><div className="flex items-end justify-between"><span className="text-xs text-slate-300">Adesão elegível</span><strong className="text-3xl">{adherence}%</strong></div><Progress value={adherence} className="mt-2 h-2 bg-white/15" /><p className="mt-2 text-right text-xs text-slate-400">{completed} de {active} atribuições</p></div></div>
    </CardContent></Card>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ["Cumpridas", completed, "Resultado confirmado", CheckCircle2, "text-emerald-600", "bg-emerald-500/10"],
      ["Pendentes", pending, "Dentro do prazo", Clock3, "text-amber-600", "bg-amber-500/10"],
      ["Atrasadas", overdue, "Cobrança prioritária", AlertTriangle, "text-red-600", "bg-red-500/10"],
      ["Novos em listas", newcomers, "Últimos 7 dias", UserPlus, "text-sky-600", "bg-sky-500/10"],
    ].map(([label, value, detail, Icon, tone, bg]) => <Card key={String(label)} className="shadow-sm"><CardContent className="flex items-center gap-4 p-4"><div className={`rounded-xl p-3 ${bg}`}><Icon className={`h-5 w-5 ${tone}`} /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p><p className="text-[11px] text-muted-foreground">{detail}</p></div></CardContent></Card>)}</div>

    <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4" /> Distribuição da equipe</CardTitle><CardDescription>Faixas de desempenho justo.</CardDescription></CardHeader><CardContent className="space-y-4">{distribution.map(({ faixa, count }) => { const pct = ranking.length ? Math.round(count / ranking.length * 100) : 0; return <div key={faixa} className="grid grid-cols-[88px_1fr_58px] items-center gap-3"><Badge variant="outline" className={FAIXA_META[faixa].className}>{FAIXA_META[faixa].label}</Badge><Progress value={pct} className="h-2" /><span className="text-right text-xs font-medium">{count} · {pct}%</span></div>; })}</CardContent></Card>
      <Card className="border-emerald-500/25 bg-emerald-500/5"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Gestão justa</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p>Somente missões em que a pessoa já era elegível entram no índice.</p><div className="flex items-center justify-between rounded-lg bg-background p-3"><span>Faltas retroativas dispensadas</span><Badge variant="outline">{corrected}</Badge></div><p className="text-xs text-muted-foreground">Novos participantes não são prejudicados por publicações anteriores.</p></CardContent></Card></div>

    <Card><CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><Filter className="h-4 w-4" /> Segmentação da cobrança</CardTitle><CardDescription>Combine filtros para criar sua fila de atuação.</CardDescription></div><Badge variant="secondary">{queue.length} pessoas para agir</Badge></div></CardHeader><CardContent><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
      <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome ou telefone" /></div>
      <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todas as faixas</SelectItem>{(["critico", "baixo", "atencao", "excelente"] as Faixa[]).map((item) => <SelectItem key={item} value={item}>{FAIXA_META[item].label}</SelectItem>)}</SelectContent></Select>
      <Select value={cargo} onValueChange={setCargo}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os cargos</SelectItem>{cargos.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
      <Select value={regiao} onValueChange={setRegiao}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todas as regiões</SelectItem>{regioes.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
    </div></CardContent></Card>

    <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]"><Card><CardHeader><div className="flex items-start justify-between gap-2"><div><CardTitle className="flex items-center gap-2 text-base"><MessageCircle className="h-4 w-4" /> Fila prioritária</CardTitle><CardDescription>Ordenada por faltas elegíveis e menor índice.</CardDescription></div><Button size="sm" variant="ghost" onClick={() => onNavigate("cobranca")}>Ranking <ArrowRight className="ml-1 h-4 w-4" /></Button></div></CardHeader><CardContent className="divide-y rounded-lg border p-0">
      {!queue.length && <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma pessoa encontrada neste segmento.</p>}
      {queue.slice(0, 10).map((person, index) => { const key = `${person.origem}:${person.ref_id}`; return <div key={key} className="flex flex-wrap items-center gap-3 p-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold">{index + 1}</div><div className="min-w-44 flex-1"><p className="truncate text-sm font-semibold">{person.nome}</p><p className="text-[11px] text-muted-foreground">{[person.cargo, person.regiao || person.cidade].filter(Boolean).join(" · ") || "Sem segmento"}</p></div><div className="text-center"><p className="text-sm font-bold text-destructive">{person.nao_cumpridas}</p><p className="text-[10px] text-muted-foreground">faltas</p></div><Badge variant="outline" className={FAIXA_META[person.faixa].className}>{person.indice} pts</Badge><Button size="sm" disabled={charging === key || !person.telefone} onClick={() => charge(person)}><MessageCircle className="mr-1.5 h-4 w-4" /> Cobrar</Button></div>; })}
    </CardContent></Card>
      <Card><CardHeader><div className="flex items-start justify-between gap-2"><div><CardTitle className="flex items-center gap-2 text-base"><Target className="h-4 w-4" /> Missões em risco</CardTitle><CardDescription>Adesão abaixo de 70%.</CardDescription></div><Button size="sm" variant="ghost" onClick={() => onNavigate("monitoramento")}>Ver todas</Button></div></CardHeader><CardContent className="space-y-3">{!missionsAtRisk.length && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma missão em risco.</p>}{missionsAtRisk.slice(0, 6).map((mission) => <div key={mission.mission_id} className="space-y-2 rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{mission.titulo || "Missão"}</span><Badge variant="outline">{mission.adesao}%</Badge></div><Progress value={mission.adesao} className="h-1.5" /><p className="text-[11px] text-muted-foreground">{fmtDate(mission.publicado_em)} · {mission.nao_cumpridas} atrasadas · {mission.pendentes} pendentes</p></div>)}</CardContent></Card></div>
    <div className="flex flex-wrap gap-2"><Button onClick={() => onNavigate("checkin")}><Target className="mr-2 h-4 w-4" /> Acompanhar missão</Button><Button variant="outline" onClick={() => onNavigate("publico")}><Users className="mr-2 h-4 w-4" /> Gerenciar público</Button><Button variant="outline" onClick={() => onNavigate("cobranca")}><AlertTriangle className="mr-2 h-4 w-4" /> Gestão detalhada</Button></div>
  </div>;
}
