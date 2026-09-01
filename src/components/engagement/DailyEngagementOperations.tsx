import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CheckCircle2, Clock3, MessageCircle, MousePointerClick, RefreshCw, Search, Users, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { registrarCobranca } from "@/lib/engagement-monitor";
import { toWhatsAppBR } from "@/lib/phone-utils";

type MissionOption = { mission_id: string; titulo: string; publicado_em: string; is_active: boolean };
type Person = { pessoa_id: string; origem: string; nome: string; telefone: string | null; cargo: string | null; regiao: string | null; cidade: string | null; status: "cumpriu" | "abriu" | "nao_abriu"; prova: string | null; cumprido_em: string | null; primeiro_acesso_em: string | null; concluiu_hoje: boolean; abriu_hoje: boolean };
type Center = {
  mission: { id: string; title: string; platform: string | null; published_at: string } | null;
  cumulative: { obrigados: number; concluidos: number; abriu_sem_concluir: number; nao_abriu: number; taxa: number; e1: number; e2: number; e3: number };
  today: { dia: string; eventos: number; pessoas_identificadas: number; aberturas: number; cliques: number; confirmacoes_evento: number; lideres_concluiram: number; lideres_abriram: number };
  hourly: { hora: number; eventos: number; pessoas: number; confirmacoes: number }[];
  people: Person[]; updated_at: string;
};
type CoordinatorTeam = {
  coordenador_id: string; coordenador_nome: string; coordenador_telefone: string | null;
  total_lideres: number; concluidos: number; abriu_sem_concluir: number; nao_abriu: number;
  taxa: number; concluidos_nomes: string[]; abriu_nomes: string[]; nao_abriu_nomes: string[];
};
type CompletionAudit = {
  obrigados: number; confirmacoes_brutas: number; lideres_confirmados: number;
  confirmacoes_fora_da_base: number; concluidos_exibidos: number; consistente: boolean;
  nao_vinculados: { participant_id: string; nome: string; telefone: string; concluido_em: string }[];
  auditado_em: string;
};

const db = supabase as any;
const todayCuiaba = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Cuiaba", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const n = (value: unknown) => Number(value ?? 0);

export default function DailyEngagementOperations({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [missionId, setMissionId] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("pendentes");
  const [busy, setBusy] = useState<string | null>(null);

  const missions = useQuery({
    queryKey: ["engagement-operational-missions", clientId],
    queryFn: async () => {
      const { data, error } = await db.rpc("engagement_operational_missions", { p_client_id: clientId, p_limit: 50 });
      if (error) throw new Error(error.message);
      return (data ?? []) as MissionOption[];
    }, enabled: !!clientId,
  });
  useEffect(() => { if (!missionId && missions.data?.[0]) setMissionId(missions.data[0].mission_id); }, [missionId, missions.data]);

  const center = useQuery({
    queryKey: ["engagement-mission-command-center", clientId, missionId],
    queryFn: async () => {
      const { data, error } = await db.rpc("engagement_mission_command_center", { p_client_id: clientId, p_mission_id: missionId || null, p_dia: todayCuiaba(), p_root_id: null });
      if (error) throw new Error(error.message);
      return data as Center;
    }, enabled: !!clientId && (!!missionId || missions.isSuccess), refetchInterval: 20_000, staleTime: 5_000,
  });

  const coordinatorTeams = useQuery({
    queryKey: ["engagement-coordinator-mission-charge", clientId, missionId],
    queryFn: async () => {
      const { data, error } = await db.rpc("engagement_coordinator_mission_charge", { p_client_id: clientId, p_mission_id: missionId });
      if (error) throw new Error(error.message);
      return (data ?? []) as CoordinatorTeam[];
    }, enabled: !!clientId && !!missionId, staleTime: 5_000, refetchInterval: 20_000,
  });
  const completionAudit = useQuery({
    queryKey: ["engagement-mission-completion-audit", clientId, missionId],
    queryFn: async () => {
      const { data, error } = await db.rpc("engagement_mission_completion_audit", { p_client_id: clientId, p_mission_id: missionId });
      if (error) throw new Error(error.message);
      return data as CompletionAudit;
    }, enabled: !!clientId && !!missionId, staleTime: 5_000, refetchInterval: 20_000,
  });

  useEffect(() => {
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: ["engagement-mission-command-center", clientId] });
      void qc.invalidateQueries({ queryKey: ["engagement-coordinator-mission-charge", clientId] });
      void qc.invalidateQueries({ queryKey: ["engagement-mission-completion-audit", clientId] });
    };
    const channel = supabase.channel(`engagement-command-${clientId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mission_events", filter: `client_id=eq.${clientId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "mission_checkins", filter: `client_id=eq.${clientId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "engagement_obrigacoes", filter: `client_id=eq.${clientId}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [clientId, qc]);

  const data = center.data;
  const chargeCertified = completionAudit.isSuccess && completionAudit.data.consistente;
  const people = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.people ?? []).filter((p) => {
      if (q && !`${p.nome} ${p.telefone || ""} ${p.regiao || ""} ${p.cidade || ""}`.toLowerCase().includes(q)) return false;
      if (status === "pendentes") return p.status !== "cumpriu";
      if (status === "nao_abriu") return p.status === "nao_abriu";
      if (status === "abriu") return p.status === "abriu";
      if (status === "cumpriu") return p.status === "cumpriu";
      if (status === "concluiu_hoje") return p.concluiu_hoje;
      return true;
    });
  }, [data?.people, search, status]);

  const charge = async (p: Person) => {
    const phone = toWhatsAppBR(p.telefone || ""); if (!phone) return toast.error("WhatsApp não cadastrado.");
    const text = `Olá, ${p.nome.split(" ")[0]}! A missão “${data?.mission?.title || "da campanha"}” ainda está pendente. Pode acessar, interagir e confirmar pelo link, por favor?`;
    setBusy(p.pessoa_id);
    try { await registrarCobranca(clientId, "eleicao_pessoas", p.pessoa_id, "whatsapp", text); window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao cobrar"); } finally { setBusy(null); }
  };

  const chargeCoordinator = async (team: CoordinatorTeam) => {
    if (!chargeCertified) return toast.error("Cobrança bloqueada: aguarde a auditoria das conclusões ficar consistente.");
    const phone = toWhatsAppBR(team.coordenador_telefone || "");
    if (!phone) return toast.error("Coordenador sem WhatsApp cadastrado.");
    const missionLink = `${window.location.origin}/missao/${data?.mission?.id}`;
    const names = (items: string[]) => items.length ? items.map((name) => `- ${name}`).join("\n") : "- Ninguém";
    const pending = n(team.abriu_sem_concluir) + n(team.nao_abriu);
    const text = [
      `Olá, ${team.coordenador_nome.split(" ")[0]}!`, "",
      "Acompanhamento da sua equipe na missão:",
      `*${data?.mission?.title || "Missão da campanha"}*`, "",
      "*Resumo da equipe*",
      `- Líderes: ${team.total_lideres}`,
      `- Concluíram: ${team.concluidos}`,
      `- Abriram e não concluíram: ${team.abriu_sem_concluir}`,
      `- Ainda não abriram: ${team.nao_abriu}`,
      `- Adesão: ${n(team.taxa).toFixed(1)}%`, "",
      `*Concluíram (${team.concluidos})*`, names(team.concluidos_nomes), "",
      `*Abriram, mas ainda não concluíram (${team.abriu_sem_concluir})*`, names(team.abriu_nomes), "",
      `*Ainda não abriram (${team.nao_abriu})*`, names(team.nao_abriu_nomes), "",
      pending > 0
        ? `Temos ${pending} líder(es) pendente(s). Por favor, encaminhe o link abaixo e acompanhe a conclusão de cada um:`
        : "Parabéns! Toda a sua equipe concluiu esta missão.",
      missionLink,
    ].join("\n");
    const key = `coordinator:${team.coordenador_id}`;
    setBusy(key);
    try {
      await registrarCobranca(clientId, "eleicao_pessoas", team.coordenador_id, "whatsapp", text);
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      toast.success("Mensagem completa preparada para o coordenador.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao cobrar coordenador"); }
    finally { setBusy(null); }
  };

  if (missions.isLoading || center.isLoading) return <Skeleton className="h-[650px]" />;
  if (missions.isError || center.isError) return <Card><CardContent className="space-y-2 py-12 text-center"><p className="font-medium text-destructive">Não foi possível carregar a operação da missão.</p><p className="text-xs text-muted-foreground">{(missions.error as Error)?.message || (center.error as Error)?.message}</p><Button variant="outline" size="sm" onClick={() => { missions.refetch(); center.refetch(); }}>Tentar novamente</Button></CardContent></Card>;
  if (!data?.mission) return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Nenhuma publicação rastreada encontrada.</CardContent></Card>;

  const c=data.cumulative,t=data.today,published=new Date(data.mission.published_at);
  const maxHour=Math.max(1,...(data.hourly??[]).map((h)=>n(h.eventos)));
  const ageHours=Math.max(0,Math.floor((Date.now()-published.getTime())/3_600_000));
  const cumulativeCards = [["Líderes obrigados",c.obrigados,Users],["Concluíram",c.concluidos,CheckCircle2],["Abriram, não concluíram",c.abriu_sem_concluir,Clock3],["Nunca abriram",c.nao_abriu,XCircle],["Adesão acumulada",`${n(c.taxa).toFixed(1)}%`,Activity]] as const;
  const todayCards = [["Interações hoje",t.eventos,Activity],["Pessoas identificadas",t.pessoas_identificadas,Users],["Líderes que concluíram hoje",t.lideres_concluiram,CheckCircle2],["Cliques hoje",t.cliques,MousePointerClick]] as const;

  return <div className="space-y-4">
    <Card><CardHeader><CardTitle className="text-base">Operação da missão</CardTitle><CardDescription>Resultado acumulado desde a publicação e movimento de hoje, sem misturar missões.</CardDescription></CardHeader><CardContent className="flex flex-wrap items-end gap-3"><div className="min-w-[280px] flex-1 space-y-1"><p className="text-xs font-medium">Missão acompanhada</p><Select value={missionId} onValueChange={setMissionId}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{(missions.data??[]).map((m)=><SelectItem key={m.mission_id} value={m.mission_id}>{m.titulo}</SelectItem>)}</SelectContent></Select></div><div className="text-xs text-muted-foreground"><p>Publicada em {published.toLocaleString("pt-BR")}</p><p>No ar há {ageHours<24?`${ageHours}h`:`${Math.floor(ageHours/24)} dias`}</p></div><Button variant="outline" onClick={()=>center.refetch()} disabled={center.isFetching}><RefreshCw className={`mr-1 h-4 w-4 ${center.isFetching?"animate-spin":""}`}/>Atualizar</Button></CardContent></Card>
    <section><h2 className="mb-2 text-sm font-semibold">Resultado acumulado da missão</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{cumulativeCards.map(([label,value,Icon])=><Card key={label}><CardContent className="flex items-center gap-3 p-4"><Icon className="h-5 w-5 text-primary"/><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></div></CardContent></Card>)}</div></section>
    <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-2"><div><CardTitle className="text-base">Funil acumulado</CardTitle><CardDescription>Desde {published.toLocaleDateString("pt-BR")} até agora.</CardDescription></div><Badge variant="outline">E1 {c.e1} · E2 {c.e2} · E3 {c.e3}</Badge></div></CardHeader><CardContent className="space-y-3"><Progress value={n(c.taxa)} className="h-3"/><div className="grid gap-2 text-sm sm:grid-cols-3"><p className="rounded border p-2 text-emerald-700"><strong>{c.concluidos}</strong> concluíram</p><p className="rounded border p-2 text-amber-700"><strong>{c.abriu_sem_concluir}</strong> abriram e não concluíram</p><p className="rounded border p-2 text-destructive"><strong>{c.nao_abriu}</strong> nunca abriram</p></div><p className="text-xs text-muted-foreground">Conferência: {n(c.concluidos)+n(c.abriu_sem_concluir)+n(c.nao_abriu)} de {c.obrigados} líderes classificados.</p></CardContent></Card>
    <section><h2 className="mb-2 text-sm font-semibold">Movimento de hoje</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{todayCards.map(([label,value,Icon])=><Card key={label}><CardContent className="flex items-center gap-3 p-4"><Icon className="h-5 w-5 text-primary"/><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></div></CardContent></Card>)}</div></section>
    <Card><CardHeader><CardTitle className="text-base">Ritmo de hoje por hora</CardTitle><CardDescription>Atualização automática a cada 20 segundos e em novos eventos.</CardDescription></CardHeader><CardContent><div className="flex h-36 items-end gap-1">{(data.hourly??[]).map((h)=><div key={h.hora} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${h.hora}h: ${h.eventos} eventos · ${h.confirmacoes} confirmações`}><div className="w-full rounded-t bg-primary/70" style={{height:`${Math.max(h.eventos?6:1,(h.eventos/maxHour)*110)}px`}}/><span className="text-[9px] text-muted-foreground">{h.hora%3===0?h.hora:""}</span></div>)}</div></CardContent></Card>
    <Card className={chargeCertified?"border-emerald-500/40":"border-amber-500/60"}><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><div><CardTitle className="text-base">Auditoria antes da cobrança</CardTitle><CardDescription>Compara as confirmações brutas com os líderes identificados e com o número exibido.</CardDescription></div><Badge variant={chargeCertified?"default":"destructive"}>{chargeCertified?"Dados reconciliados":"Cobrança bloqueada"}</Badge></div></CardHeader><CardContent>{completionAudit.isLoading?<Skeleton className="h-20 w-full"/>:completionAudit.isError?<p className="text-sm text-destructive">Auditoria indisponível: {(completionAudit.error as Error).message}</p>:<div className="grid gap-2 text-sm sm:grid-cols-4"><p className="rounded border p-3"><strong className="block text-xl">{completionAudit.data?.confirmacoes_brutas??0}</strong>confirmações brutas</p><p className="rounded border p-3"><strong className="block text-xl">{completionAudit.data?.lideres_confirmados??0}</strong>líderes confirmados</p><p className="rounded border p-3"><strong className="block text-xl">{completionAudit.data?.confirmacoes_fora_da_base??0}</strong>fora da base de líderes</p><p className="rounded border p-3"><strong className="block text-xl">{completionAudit.data?.concluidos_exibidos??0}</strong>exibidos no painel</p></div>}</CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Cobrança por coordenador</CardTitle><CardDescription>Abra o WhatsApp com o resultado completo da equipe e o link rastreável desta missão.</CardDescription></CardHeader><CardContent className="space-y-3">{coordinatorTeams.isLoading&&<Skeleton className="h-28 w-full"/>}{coordinatorTeams.isError&&<p className="text-sm text-destructive">Não foi possível carregar as equipes: {(coordinatorTeams.error as Error).message}</p>}<div className="max-h-[440px] divide-y overflow-auto rounded-lg border">{coordinatorTeams.data?.map((team)=>{const pending=n(team.abriu_sem_concluir)+n(team.nao_abriu);return <div key={team.coordenador_id} className="flex flex-wrap items-center gap-3 p-3"><div className="min-w-52 flex-1"><p className="font-semibold">{team.coordenador_nome}</p><p className="text-xs text-muted-foreground">{team.total_lideres} líderes · {team.concluidos} concluíram · {pending} pendentes</p><Progress value={n(team.taxa)} className="mt-2 h-2"/></div><div className="flex gap-2"><Badge variant="outline" className="text-emerald-700">{n(team.taxa).toFixed(1)}%</Badge><Button size="sm" disabled={busy===`coordinator:${team.coordenador_id}`||!team.coordenador_telefone} onClick={()=>chargeCoordinator(team)}><MessageCircle className="mr-1 h-4 w-4"/>Cobrar equipe</Button></div></div>})}{coordinatorTeams.isSuccess&&!coordinatorTeams.data.length&&<p className="py-10 text-center text-sm text-muted-foreground">Nenhuma equipe vinculada a coordenador nesta missão.</p>}</div></CardContent></Card>
    <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-2"><div><CardTitle className="text-base">Líderes da missão</CardTitle><CardDescription>Base acumulada; filtre “Concluíram hoje” para acompanhar o avanço.</CardDescription></div><Badge variant="outline">Atualizado {new Date(data.updated_at).toLocaleTimeString("pt-BR")}</Badge></div></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2"><div className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="pl-9" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Nome, telefone, região ou cidade"/></div><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-[210px]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="pendentes">Todos os pendentes</SelectItem><SelectItem value="nao_abriu">Nunca abriram</SelectItem><SelectItem value="abriu">Abriram, não concluíram</SelectItem><SelectItem value="cumpriu">Concluíram</SelectItem><SelectItem value="concluiu_hoje">Concluíram hoje</SelectItem><SelectItem value="todos">Todos</SelectItem></SelectContent></Select></div><p className="text-xs text-muted-foreground"><strong>{people.length}</strong> líderes neste filtro.</p><div className="max-h-[520px] divide-y overflow-auto rounded-lg border">{!people.length&&<p className="py-10 text-center text-sm text-muted-foreground">Nenhum líder neste filtro.</p>}{people.map((p)=><div key={`${p.origem}-${p.pessoa_id}`} className="flex flex-wrap items-center gap-2 p-3"><div className="min-w-52 flex-1"><p className="font-semibold">{p.nome}</p><p className="text-xs text-muted-foreground">{p.telefone||"sem telefone"} · {p.regiao||p.cidade||"sem região"}</p></div>{p.concluiu_hoje&&<Badge className="bg-emerald-600">Concluiu hoje</Badge>}<Badge variant="outline" className={p.status==="cumpriu"?"text-emerald-700":p.status==="abriu"?"text-amber-700":"text-destructive"}>{p.status==="cumpriu"?"Concluiu":p.status==="abriu"?"Abriu, não concluiu":"Não abriu"}</Badge>{p.status!=="cumpriu"&&<Button size="sm" disabled={busy===p.pessoa_id||!p.telefone} onClick={()=>charge(p)}><MessageCircle className="mr-1 h-4 w-4"/>Cobrar</Button>}</div>)}</div></CardContent></Card>
  </div>;
}
