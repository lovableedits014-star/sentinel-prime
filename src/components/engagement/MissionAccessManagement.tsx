import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, MessageCircle, Search, Unlink, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAccessPeople, fetchAccessSummary, registrarCobranca, type AccessPerson } from "@/lib/engagement-monitor";
import { toWhatsAppBR } from "@/lib/phone-utils";

type Props = { clientId: string };
type Filter = "todos" | "pendentes" | "concluidos" | "sem_acesso" | "nao_vinculados";

export default function MissionAccessManagement({ clientId }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("pendentes");
  const [charging, setCharging] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["engagement-access-management", clientId], queryFn: async () => {
    const [summary, people] = await Promise.all([fetchAccessSummary(clientId), fetchAccessPeople(clientId)]);
    return { summary, people };
  }, staleTime: 30_000 });
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return (query.data?.people ?? []).filter((person) => {
      if (term && !`${person.nome} ${person.telefone} ${person.coordenador_nome || ""}`.toLocaleLowerCase("pt-BR").includes(term)) return false;
      if (filter === "pendentes") return Number(person.pendentes) > 0;
      if (filter === "concluidos") return Number(person.missoes_concluidas) > 0;
      if (filter === "sem_acesso") return Number(person.missoes_acessadas) === 0;
      if (filter === "nao_vinculados") return !person.vinculado;
      return true;
    });
  }, [query.data?.people, search, filter]);
  const charge = async (person: AccessPerson) => {
    const phone = toWhatsAppBR(person.telefone);
    if (!phone) return toast.error("Esta pessoa não possui WhatsApp válido.");
    const text = Number(person.pendentes) > 0 ? `Olá, ${person.nome}! Você possui ${person.pendentes} missão(ões) acessada(s) que ainda não foram concluída(s). Pode verificar, por favor?` : `Olá, ${person.nome}! Ainda não identificamos seu acesso às missões. Pode verificar o link enviado, por favor?`;
    setCharging(person.participant_id);
    try {
      await registrarCobranca(clientId, "participant", person.participant_id, "whatsapp", text);
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      toast.success("Cobrança registrada e WhatsApp aberto.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível registrar a cobrança."); }
    finally { setCharging(null); }
  };
  const chargeCoordinator = async (person: AccessPerson) => {
    const phone = toWhatsAppBR(person.coordenador_telefone || "");
    if (!phone || !person.coordenador_id) return toast.error("O responsável não possui WhatsApp válido.");
    const text = `Olá, ${person.coordenador_nome}! Na sua estrutura, ${person.nome} possui ${person.pendentes} missão(ões) acessada(s) e ainda não concluída(s). Pode acompanhar essa pendência, por favor?`;
    const key = `root:${person.coordenador_id}`;
    setCharging(key);
    try {
      await registrarCobranca(clientId, "eleicao_pessoas", person.coordenador_id, "whatsapp", text);
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      toast.success("Cobrança do responsável registrada.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível cobrar o responsável."); }
    finally { setCharging(null); }
  };
  if (query.isLoading) return <Skeleton className="h-[560px] w-full" />;
  if (query.isError || !query.data) return <Card><CardContent className="py-10 text-center text-sm text-destructive">Não foi possível carregar os cadastros feitos pelos links.</CardContent></Card>;
  const s = query.data.summary;
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ["Cadastrados pelo link", s.cadastrados, "Nome e telefone identificados", Users],
      ["Acessaram missões", s.acessaram, `${s.sem_acesso} ainda sem acesso`, UserCheck],
      ["Conclusões reais", s.conclusoes, `${s.pessoas_concluiram} pessoas concluíram`, CheckCircle2],
      ["Aguardando conclusão", s.aguardando_conclusao, "Acessaram, mas não concluíram", Clock3],
    ].map(([label, value, detail, Icon]) => <Card key={String(label)}><CardContent className="flex items-center gap-3 p-4"><Icon className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">{label as string}</p><p className="text-2xl font-bold">{value as number}</p><p className="text-[11px] text-muted-foreground">{detail as string}</p></div></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle className="text-base">Gestão das pessoas identificadas</CardTitle><CardDescription>Priorize quem acessou sem concluir, cobre individualmente e identifique o coordenador responsável.</CardDescription></CardHeader><CardContent className="space-y-3">
      <div className="grid gap-2 md:grid-cols-[1fr_220px_auto]"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Nome, telefone ou coordenador" value={search} onChange={(e) => setSearch(e.target.value)} /></div><Select value={filter} onValueChange={(value) => setFilter(value as Filter)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pendentes">Aguardando conclusão</SelectItem><SelectItem value="sem_acesso">Sem acesso</SelectItem><SelectItem value="concluidos">Com conclusão</SelectItem><SelectItem value="nao_vinculados">Sem vínculo cadastral</SelectItem><SelectItem value="todos">Todos</SelectItem></SelectContent></Select><Badge variant="secondary" className="h-9 justify-center">{rows.length} pessoas</Badge></div>
      <div className="max-h-[560px] divide-y overflow-auto rounded-lg border">{!rows.length && <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma pessoa neste filtro.</p>}{rows.map((person) => <div key={person.participant_id} className="flex flex-wrap items-center gap-3 p-3"><div className="min-w-52 flex-1"><p className="text-sm font-semibold">{person.nome}</p><p className="text-xs text-muted-foreground">{person.telefone} · {person.cargo || "Sem cargo"}</p><p className="text-[11px] text-muted-foreground">Responsável da raiz: {person.coordenador_nome || "não identificado"}</p></div><div className="flex gap-4 text-center"><div><p className="font-bold">{person.missoes_acessadas}</p><p className="text-[10px] text-muted-foreground">acessadas</p></div><div><p className="font-bold text-emerald-600">{person.missoes_concluidas}</p><p className="text-[10px] text-muted-foreground">concluídas</p></div><div><p className="font-bold text-amber-600">{person.pendentes}</p><p className="text-[10px] text-muted-foreground">pendentes</p></div></div>{!person.vinculado && <Badge variant="outline" className="text-amber-600"><Unlink className="mr-1 h-3 w-3" /> sem vínculo</Badge>}{person.coordenador_id && person.coordenador_id !== person.participant_id && <Button size="sm" variant="outline" disabled={charging === `root:${person.coordenador_id}`} onClick={() => chargeCoordinator(person)}>Cobrar raiz</Button>}<Button size="sm" disabled={charging === person.participant_id} onClick={() => charge(person)}><MessageCircle className="mr-1.5 h-4 w-4" /> Cobrar pessoa</Button></div>)}</div>
    </CardContent></Card>
  </div>;
}
