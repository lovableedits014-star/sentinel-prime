import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, FileDown, MessageCircle, Search, Unlink, UserCheck, Users } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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
type Filter = "todos" | "externos" | "sem_contrato" | "pendentes" | "concluidos" | "sem_acesso" | "nao_vinculados";

export default function MissionAccessManagement({ clientId }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("externos");
  const [charging, setCharging] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["engagement-access-management", clientId], queryFn: async () => {
    const [summary, people] = await Promise.all([fetchAccessSummary(clientId), fetchAccessPeople(clientId)]);
    return { summary, people };
  }, staleTime: 30_000 });
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return (query.data?.people ?? []).filter((person) => {
      if (term && !`${person.nome} ${person.telefone} ${person.coordenador_nome || ""}`.toLocaleLowerCase("pt-BR").includes(term)) return false;
      if (filter === "externos") return !person.vinculado || !person.tem_contrato;
      if (filter === "sem_contrato") return !person.tem_contrato;
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
    try { await registrarCobranca(clientId, "participant", person.participant_id, "whatsapp", text); window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer"); toast.success("Cobrança registrada e WhatsApp aberto."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível registrar a cobrança."); }
    finally { setCharging(null); }
  };
  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16); doc.text("Participantes das missões", 14, 16);
    doc.setFontSize(9); doc.setTextColor(90); doc.text(`${rows.length} pessoa(s) · relatório gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 23);
    autoTable(doc, { startY: 28, head: [["Nome", "Telefone", "Vínculo", "Contrato", "Acessadas", "Concluídas", "Pendentes", "Último acesso"]], body: rows.map(p => [p.nome, p.telefone || "—", p.origem_vinculo === "nao_cadastrado" ? "Não cadastrado" : p.origem_vinculo, p.tem_contrato ? "Ativo" : "Sem contrato", p.missoes_acessadas, p.missoes_concluidas, p.pendentes, p.ultimo_acesso ? new Date(p.ultimo_acesso).toLocaleString("pt-BR") : "—"]), styles: { fontSize: 8, cellPadding: 2.5 }, headStyles: { fillColor: [30, 64, 175] }, alternateRowStyles: { fillColor: [245, 247, 250] } });
    doc.save("participantes-missoes.pdf");
  };
  if (query.isLoading) return <Skeleton className="h-[560px] w-full" />;
  if (query.isError || !query.data) return <Card><CardContent className="py-10 text-center text-sm text-destructive">Não foi possível carregar os participantes. Verifique se a migration mais recente foi aplicada.</CardContent></Card>;
  const s = query.data.summary;
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Identificados pelos links", s.cadastrados, "Com nome e telefone", Users], ["Acessaram missões", s.acessaram, `${s.sem_acesso} ainda sem acesso`, UserCheck], ["Conclusões reais", s.conclusoes, `${s.pessoas_concluiram} pessoas concluíram`, CheckCircle2], ["Aguardando conclusão", s.aguardando_conclusao, "Acessaram, mas não concluíram", Clock3]].map(([label, value, detail, Icon]) => <Card key={String(label)}><CardContent className="flex items-center gap-3 p-4"><Icon className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">{label as string}</p><p className="text-2xl font-bold">{value as number}</p><p className="text-[11px] text-muted-foreground">{detail as string}</p></div></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle className="text-base">Gestão de participantes e externos</CardTitle><CardDescription>Todos que se identificaram pelos links, inclusive não cadastrados e pessoas sem contrato ativo.</CardDescription></CardHeader><CardContent className="space-y-3">
      <div className="grid gap-2 md:grid-cols-[1fr_220px_auto_auto]"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Nome, telefone ou coordenador" value={search} onChange={(e) => setSearch(e.target.value)} /></div><Select value={filter} onValueChange={(value) => setFilter(value as Filter)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="externos">Externos e sem contrato</SelectItem><SelectItem value="sem_contrato">Todos sem contrato ativo</SelectItem><SelectItem value="nao_vinculados">Não cadastrados</SelectItem><SelectItem value="pendentes">Aguardando conclusão</SelectItem><SelectItem value="sem_acesso">Sem acesso</SelectItem><SelectItem value="concluidos">Com conclusão</SelectItem><SelectItem value="todos">Todos</SelectItem></SelectContent></Select><Badge variant="secondary" className="h-9 justify-center">{rows.length} pessoas</Badge><Button variant="outline" className="h-9" onClick={exportPdf}><FileDown className="mr-1.5 h-4 w-4" />PDF</Button></div>
      <div className="max-h-[560px] divide-y overflow-auto rounded-lg border">{!rows.length && <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma pessoa neste filtro.</p>}{rows.map((person) => <div key={person.participant_id} className="flex flex-wrap items-center gap-3 p-3"><div className="min-w-52 flex-1"><p className="text-sm font-semibold">{person.nome}</p><p className="text-xs text-muted-foreground">{person.telefone} · {person.cargo || "Sem cargo"}</p><p className="text-[11px] text-muted-foreground">Responsável: {person.coordenador_nome || "não identificado"}</p></div><div className="flex flex-wrap gap-1">{!person.vinculado && <Badge variant="outline" className="text-amber-600"><Unlink className="mr-1 h-3 w-3" /> não cadastrado</Badge>}{!person.tem_contrato && <Badge variant="outline" className="text-orange-600">sem contrato ativo</Badge>}</div><div className="flex gap-4 text-center"><div><p className="font-bold">{person.missoes_acessadas}</p><p className="text-[10px] text-muted-foreground">acessadas</p></div><div><p className="font-bold text-emerald-600">{person.missoes_concluidas}</p><p className="text-[10px] text-muted-foreground">concluídas</p></div><div><p className="font-bold text-amber-600">{person.pendentes}</p><p className="text-[10px] text-muted-foreground">pendentes</p></div></div><Button size="sm" disabled={charging === person.participant_id} onClick={() => charge(person)}><MessageCircle className="mr-1.5 h-4 w-4" /> Cobrar</Button></div>)}</div>
    </CardContent></Card>
  </div>;
}
