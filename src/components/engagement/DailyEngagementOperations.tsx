import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, MessageCircle, RefreshCw, Search, Users, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { registrarCobranca } from "@/lib/engagement-monitor";
import { toWhatsAppBR } from "@/lib/phone-utils";

type Mission = { mission_id: string; titulo: string; plataforma: string | null; publicado_em: string; publico_congelado: number; publico_valido: number; concluiram: number; abriram_sem_concluir: number; nao_abriram: number; dispensados: number; taxa: number };
type Reach = { mission_id: string; eventos: number; pessoas_identificadas: number; grupos_alcancados: number; aberturas: number; cliques: number; confirmacoes: number };
type Person = { pessoa_id: string; nome: string; telefone: string; cargo: string; regiao: string | null; coordenador_id: string | null; coordenador_nome: string | null; coordenador_telefone: string | null; contratado: boolean; voluntario: boolean; missoes: number; concluidas: number; pendentes: number; taxa: number; ultima_atividade: string | null; status_hoje: "concluiu" | "pendente" | "sem_missao" };
const db = supabase as any;

export default function DailyEngagementOperations({ clientId }: { clientId: string }) {
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["engagement-daily-operations", clientId], queryFn: async () => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Cuiaba",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const [m, p, r] = await Promise.all([
      db.rpc("engagement_daily_missions", { p_client_id: clientId, p_dia: today }),
      db.rpc("engagement_campaign_team", { p_client_id: clientId, p_dias: 30 }),
      db.rpc("engagement_daily_reach", { p_client_id: clientId, p_dia: today }),
    ]);
    if (m.error) throw new Error(m.error.message);
    if (p.error) throw new Error(p.error.message);
    return {
      missions: (m.data ?? []) as Mission[],
      people: (p.data ?? []) as Person[],
      reach: (r.data ?? []) as Reach[],
      reachError: r.error?.message ?? null,
    };
  }, staleTime: 20_000 });
  const pending = useMemo(() => (query.data?.people ?? []).filter((p) => p.contratado && p.status_hoje === "pendente" && `${p.nome} ${p.telefone} ${p.coordenador_nome || ""}`.toLowerCase().includes(search.toLowerCase())), [query.data, search]);
  const charge = async (p: Person, root = false) => {
    const phone = toWhatsAppBR(root ? p.coordenador_telefone || "" : p.telefone); if (!phone) return toast.error("WhatsApp não cadastrado.");
    const id = root ? p.coordenador_id : p.pessoa_id; if (!id) return;
    const text = root ? `Olá, ${p.coordenador_nome}! ${p.nome}, da sua equipe, ainda não concluiu a missão de hoje. Pode acompanhar, por favor?` : `Olá, ${p.nome}! A missão de hoje ainda está pendente. Pode concluir e confirmar pelo link, por favor?`;
    const key = `${root ? "r" : "p"}:${id}`; setBusy(key);
    try { await registrarCobranca(clientId, "eleicao_pessoas", id, "whatsapp", text); window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao cobrar"); } finally { setBusy(null); }
  };
  if (query.isLoading) return <Skeleton className="h-[600px]" />;
  if (query.isError || !query.data) return <Card><CardContent className="space-y-2 py-12 text-center"><p className="font-medium text-destructive">Não foi possível carregar a operação de hoje.</p><p className="text-xs text-muted-foreground">{query.error instanceof Error ? query.error.message : "Erro desconhecido retornado pelo Supabase."}</p><Button variant="outline" size="sm" onClick={() => query.refetch()}>Tentar novamente</Button></CardContent></Card>;
  const total = query.data.missions.reduce((n, m) => n + Number(m.publico_valido), 0), done = query.data.missions.reduce((n, m) => n + Number(m.concluiram), 0), opened = query.data.missions.reduce((n, m) => n + Number(m.abriram_sem_concluir), 0), missing = query.data.missions.reduce((n, m) => n + Number(m.nao_abriram), 0), events = query.data.reach.reduce((n, r) => n + Number(r.eventos), 0), identified = query.data.reach.reduce((n, r) => n + Number(r.pessoas_identificadas), 0);
  return <div className="space-y-4">
    {query.data.reachError && <Card className="border-amber-300 bg-amber-50"><CardContent className="py-3 text-sm text-amber-900">As missões e a fila foram carregadas, mas as métricas de alcance ainda não estão disponíveis no Supabase. Execute novamente a migração <strong>20260831230000_engagement_daily_contract_operations.sql</strong>.</CardContent></Card>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[["Interações registradas", events, RefreshCw],["Pessoas identificadas", identified, Users],["Contratados obrigados", total, Users],["Contratados que concluíram", done, CheckCircle2],["Contratados que abriram", opened, Clock3],["Contratados que não abriram", missing, XCircle]].map(([l,v,I]) => <Card key={String(l)}><CardContent className="flex items-center gap-3 p-4"><I className="h-5 w-5 text-primary"/><div><p className="text-xs text-muted-foreground">{String(l)}</p><p className="text-2xl font-bold">{Number(v)}</p></div></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle className="text-base">Missões de hoje</CardTitle><CardDescription>Alcance geral e cumprimento dos contratados são métricas diferentes.</CardDescription></CardHeader><CardContent className="space-y-3">{!query.data.missions.length && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma missão criada hoje.</p>}{query.data.missions.map((m) => { const r=query.data.reach.find(x=>x.mission_id===m.mission_id); return <div key={m.mission_id} className="space-y-2 rounded-lg border p-3"><div className="flex justify-between gap-3"><div><p className="font-semibold">{m.titulo}</p><p className="text-xs text-muted-foreground">Alcance: {r?.eventos??0} interações · {r?.pessoas_identificadas??0} pessoas identificadas · {r?.confirmacoes??0} pessoas confirmaram · {r?.grupos_alcancados??0} grupos</p><p className="text-xs text-muted-foreground">Cobrança: {m.publico_valido} contratados · {m.dispensados} dispensados</p></div><Badge variant="outline">{m.taxa}% dos contratados</Badge></div><Progress value={Number(m.taxa)} className="h-2"/><p className="text-xs text-muted-foreground">Entre os contratados: {m.concluiram} concluíram · {m.abriram_sem_concluir} abriram sem concluir · {m.nao_abriram} não abriram</p></div>})}</CardContent></Card>
    <Card><CardHeader><div className="flex justify-between gap-2"><div><CardTitle className="text-base">Fila de cobrança de hoje</CardTitle><CardDescription>Somente contratados com obrigação pendente hoje.</CardDescription></div><Button variant="outline" size="sm" onClick={() => query.refetch()}><RefreshCw className="mr-1 h-4 w-4"/>Atualizar</Button></div></CardHeader><CardContent className="space-y-3"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, telefone ou coordenador"/></div><div className="max-h-[500px] divide-y overflow-auto rounded-lg border">{!pending.length && <p className="py-10 text-center text-sm text-muted-foreground">Nenhum contratado pendente.</p>}{pending.map((p) => <div key={p.pessoa_id} className="flex flex-wrap items-center gap-2 p-3"><div className="min-w-52 flex-1"><p className="font-semibold">{p.nome}</p><p className="text-xs text-muted-foreground">{p.telefone} · Raiz: {p.coordenador_nome || "não identificada"}</p></div><Button size="sm" variant="outline" disabled={!p.coordenador_id || busy===`r:${p.coordenador_id}`} onClick={() => charge(p,true)}>Cobrar raiz</Button><Button size="sm" disabled={busy===`p:${p.pessoa_id}`} onClick={() => charge(p)}><MessageCircle className="mr-1 h-4 w-4"/>Cobrar pessoa</Button></div>)}</div></CardContent></Card>
  </div>;
}
