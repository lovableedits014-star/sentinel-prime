import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client-selfhosted";
const db = supabase as any;
type Row={pessoa_id:string;nome:string;telefone:string;cargo:string;regiao:string|null;coordenador_nome:string|null;contratado:boolean;voluntario:boolean;missoes:number;concluidas:number;pendentes:number;taxa:number;status_hoje:string};
export default function CampaignTeamManagement({clientId}:{clientId:string}){
 const [q,setQ]=useState(""); const [kind,setKind]=useState<"contratados"|"voluntarios">("contratados");
 const query=useQuery({queryKey:["engagement-campaign-team",clientId],queryFn:async()=>{const r=await db.rpc("engagement_campaign_team",{p_client_id:clientId,p_dias:30});if(r.error)throw new Error(r.error.message);return (r.data??[]) as Row[]},staleTime:30000});
 const rows=useMemo(()=>(query.data??[]).filter(r=>(kind==="contratados"?r.contratado:r.voluntario)&&`${r.nome} ${r.telefone} ${r.coordenador_nome||""}`.toLowerCase().includes(q.toLowerCase())),[query.data,q,kind]);
 if(query.isLoading)return <Skeleton className="h-[600px]"/>;
 return <Card><CardHeader><CardTitle>Equipe da campanha</CardTitle><CardDescription>Todos os contratados ativos são incluídos automaticamente nas novas missões. Voluntários permanecem separados.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2"><button className={`rounded-md border px-3 py-2 text-sm ${kind==="contratados"?"bg-primary text-primary-foreground":""}`} onClick={()=>setKind("contratados")}>Contratados</button><button className={`rounded-md border px-3 py-2 text-sm ${kind==="voluntarios"?"bg-primary text-primary-foreground":""}`} onClick={()=>setKind("voluntarios")}>Voluntários</button><div className="relative min-w-52 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="pl-9" value={q} onChange={e=>setQ(e.target.value)} placeholder="Nome, telefone ou responsável"/></div><Badge variant="secondary" className="h-9 px-3">{rows.length} pessoas</Badge></div><div className="max-h-[620px] divide-y overflow-auto rounded-lg border">{rows.map(r=><div key={r.pessoa_id} className="grid gap-3 p-3 md:grid-cols-[1fr_180px_220px]"><div><p className="font-semibold">{r.nome}</p><p className="text-xs text-muted-foreground">{r.telefone} · {r.cargo} · {r.regiao||"sem região"}</p><p className="text-[11px] text-muted-foreground">Raiz: {r.coordenador_nome||"não identificada"}</p></div><div><p className="text-xs text-muted-foreground">Últimos 30 dias</p><p className="text-sm font-medium">{r.concluidas}/{r.missoes} concluídas · {r.pendentes} pendentes</p><Progress value={Number(r.taxa)} className="mt-1 h-1.5"/></div><div className="flex items-center justify-end"><Badge variant="outline" className={r.status_hoje==="concluiu"?"text-emerald-600":r.status_hoje==="pendente"?"text-amber-600":"text-muted-foreground"}>{r.status_hoje==="concluiu"?"Concluiu hoje":r.status_hoje==="pendente"?"Pendente hoje":"Sem missão hoje"}</Badge></div></div>)}</div></CardContent></Card>
}
