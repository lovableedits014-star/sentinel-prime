import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Grid3x3, FileDown, FileText, Search, ShieldCheck } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { fmtData, fmtPct, type PessoaDesempenho, type PublicacaoDesempenho } from "@/lib/engagement-desempenho";

const CELL: Record<string, string> = { cumpriu: "bg-emerald-500/80", abriu: "bg-amber-400/80", nao_abriu: "bg-destructive/60" };
type Target = { pessoa: PessoaDesempenho; missao: PublicacaoDesempenho };

export default function MatrizCumprimentoPanel({ clientId, pessoas, publicacoes, periodoLabel, onChanged }: {
  clientId: string; pessoas: PessoaDesempenho[]; publicacoes: PublicacaoDesempenho[];
  periodoLabel: string; onChanged?: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [limite, setLimite] = useState(80);
  const [visao, setVisao] = useState<"contratados" | "todos" | "sem_contrato">("contratados");
  const [alvo, setAlvo] = useState<Target | null>(null);
  const [facebook, setFacebook] = useState(true);
  const [instagram, setInstagram] = useState(true);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const cols = useMemo(() => [...publicacoes].sort((a, b) => new Date(b.publicado_em || 0).getTime() - new Date(a.publicado_em || 0).getTime()), [publicacoes]);
  const filtradas = useMemo(() => { const q = busca.trim().toLowerCase(); return pessoas.filter((p) => {
    if (visao === "contratados" && !p.tem_contrato) return false;
    if (visao === "sem_contrato" && p.tem_contrato) return false;
    return !q || p.nome.toLowerCase().includes(q);
  }); }, [pessoas, busca, visao]);
  const statusDe = (p: PessoaDesempenho, missionId: string) => p.detalhe.find((d) => d.mission_id === missionId)?.status || "nao_abriu";

  const abrirEdicao = async (pessoa: PessoaDesempenho, missao: PublicacaoDesempenho) => {
    setAlvo({ pessoa, missao }); setMotivo(""); setFacebook(true); setInstagram(true);
    if (pessoa.origem !== "eleicao") return;
    const { data, error } = await (supabase as any).from("eleicao_pessoas").select("missao_facebook_ativo,missao_instagram_ativo").eq("client_id", clientId).eq("id", pessoa.pessoa_id).maybeSingle();
    if (error) toast.error("Não foi possível carregar as redes: " + error.message);
    if (data) { setFacebook(data.missao_facebook_ativo !== false); setInstagram(data.missao_instagram_ativo !== false); }
  };
  const salvarRedes = async () => {
    if (!alvo || alvo.pessoa.origem !== "eleicao") return;
    if (!facebook && !instagram) return toast.error("Selecione pelo menos uma rede");
    setSalvando(true);
    const { error } = await (supabase as any).rpc("engagement_set_person_social_requirements", { p_client_id: clientId, p_pessoa_id: alvo.pessoa.pessoa_id, p_facebook: facebook, p_instagram: instagram });
    setSalvando(false); if (error) return toast.error(error.message); toast.success("Redes obrigatórias atualizadas");
  };
  const salvarConclusao = async (completed: boolean) => {
    if (!alvo || motivo.trim().length < 5) return toast.error("Informe o motivo da correção");
    setSalvando(true);
    const { error } = await (supabase as any).rpc("engagement_set_manual_completion", { p_client_id: clientId, p_mission_id: alvo.missao.mission_id, p_pessoa_id: alvo.pessoa.pessoa_id, p_completed: completed, p_reason: motivo.trim() });
    setSalvando(false); if (error) return toast.error(error.message);
    toast.success(completed ? "Missão marcada como concluída" : "Correção manual desfeita"); setAlvo(null); onChanged?.();
  };
  const exportarExcel = () => {
    const data = filtradas.map((p) => { const row: Record<string, string | number> = { Nome: p.nome, Cargo: p.cargo || "—", Região: p.regiao || p.cidade || "—", "Cumprimento %": Number(p.pct) }; for (const c of cols) { const st = statusDe(p, c.mission_id); row[`${(c.titulo || "Publicação").slice(0, 25)} (${fmtData(c.publicado_em)})`] = st === "cumpriu" ? "Cumpriu" : st === "abriu" ? "Abriu" : "Faltou"; } return row; });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Matriz"); XLSX.writeFile(wb, `matriz-cumprimento-${periodoLabel}.xlsx`);
  };
  const exportarPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(16); doc.text("Matriz pessoa × publicação", 28, 30);
    doc.setFontSize(9); doc.setTextColor(90); doc.text(`${periodoLabel} · ${visao === "contratados" ? "Contratados" : visao === "sem_contrato" ? "Sem contrato ativo" : "Todos"} · ${filtradas.length} pessoa(s)`, 28, 45);
    const body = filtradas.map(p => [p.nome, p.cargo || "—", ...cols.map(c => { const st = statusDe(p, c.mission_id); return st === "cumpriu" ? "OK" : st === "abriu" ? "Abriu" : "Faltou"; }), fmtPct(p.pct)]);
    autoTable(doc, { startY: 56, head: [["Pessoa", "Cargo", ...cols.map(c => fmtData(c.publicado_em)), "%"]], body,
      styles: { fontSize: cols.length > 12 ? 5.5 : cols.length > 8 ? 6.5 : 8, cellPadding: 2, halign: "center", overflow: "ellipsize" },
      columnStyles: { 0: { halign: "left", cellWidth: 125 }, 1: { halign: "left", cellWidth: 65 } }, headStyles: { fillColor: [30, 64, 175] },
      didParseCell(data) { if (data.section !== "body" || data.column.index < 2 || data.column.index >= cols.length + 2) return; const value = String(data.cell.raw); if (value === "OK") data.cell.styles.fillColor = [52, 196, 141]; else if (value === "Abriu") data.cell.styles.fillColor = [251, 191, 36]; else data.cell.styles.fillColor = [248, 113, 113]; data.cell.styles.textColor = [255, 255, 255]; data.cell.styles.fontStyle = "bold"; },
      didDrawPage(data) { doc.setFontSize(7); doc.setTextColor(110); doc.text(`Página ${data.pageNumber}`, doc.internal.pageSize.getWidth() - 55, doc.internal.pageSize.getHeight() - 12); }
    });
    doc.save(`matriz-cumprimento-${periodoLabel.replace(/[^0-9a-z]+/gi, "-")}.pdf`);
  };
  const detalheAlvo = alvo?.pessoa.detalhe.find((d) => d.mission_id === alvo.missao.mission_id);
  const concluida = detalheAlvo?.status === "cumpriu";
  const manual = detalheAlvo?.prova === "E3";

  return <Card>
    <CardHeader className="px-3 sm:px-6"><div className="flex flex-wrap items-start justify-between gap-2"><div><CardTitle className="flex items-center gap-2 text-base"><Grid3x3 className="h-4 w-4 text-primary" /> Matriz pessoa × publicação</CardTitle><CardDescription className="text-xs">Por padrão, mostra somente contratos ativos. Clique em uma célula para corrigir.</CardDescription></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={exportarPdf} className="gap-1.5"><FileText className="h-4 w-4" /> PDF</Button><Button size="sm" variant="outline" onClick={exportarExcel} className="gap-1.5"><FileDown className="h-4 w-4" /> Excel</Button></div></div></CardHeader>
    <CardContent className="space-y-3 px-3 sm:px-6"><div className="flex flex-wrap items-center gap-3"><Tabs value={visao} onValueChange={v => { setVisao(v as typeof visao); setLimite(80); }}><TabsList><TabsTrigger value="contratados">Contratados ({pessoas.filter(p => p.tem_contrato).length})</TabsTrigger><TabsTrigger value="sem_contrato">Sem contrato ({pessoas.filter(p => !p.tem_contrato).length})</TabsTrigger><TabsTrigger value="todos">Todos ({pessoas.length})</TabsTrigger></TabsList></Tabs><div className="relative min-w-52 max-w-sm flex-1"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa" className="pl-8" /></div></div><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr><th className="sticky left-0 bg-background p-2 text-left">Pessoa</th>{cols.map((c) => <th key={c.mission_id} className="p-1 text-center align-bottom"><div className="mx-auto w-16 truncate text-[10px] text-muted-foreground" title={c.titulo || ""}>{fmtData(c.publicado_em)}</div></th>)}<th className="p-2 text-right">%</th></tr></thead><tbody>{filtradas.slice(0, limite).map((p) => <tr key={`${p.origem}-${p.pessoa_id}`} className="border-t"><td className="sticky left-0 max-w-[200px] truncate bg-background p-2">{p.nome}</td>{cols.map((c) => { const st = statusDe(p, c.mission_id); return <td key={c.mission_id} className="p-1"><button type="button" className={cn("mx-auto block h-4 w-10 rounded transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary", CELL[st])} title={`${c.titulo || "Publicação"} · ${st} · clique para editar`} onClick={() => abrirEdicao(p, c)} /></td>; })}<td className="p-2 text-right font-semibold tabular-nums">{fmtPct(p.pct)}</td></tr>)}</tbody></table></div>{filtradas.length > limite && <Button variant="outline" size="sm" onClick={() => setLimite((l) => l + 80)}>Mostrar mais ({filtradas.length - limite} restantes)</Button>}</CardContent>
    <Dialog open={!!alvo} onOpenChange={(open) => !open && setAlvo(null)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Editar obrigação da missão</DialogTitle></DialogHeader>{alvo && <div className="space-y-4"><div className="rounded-md border bg-muted/30 p-3 text-sm"><p className="font-semibold">{alvo.pessoa.nome}</p><p className="text-xs text-muted-foreground">{alvo.missao.titulo || "Missão"} · {fmtData(alvo.missao.publicado_em)}</p><p className="mt-1 text-xs">Status: <strong>{concluida ? "Concluída" : "Pendente"}</strong>{manual ? " · correção manual" : ""}</p></div>{alvo.pessoa.origem === "eleicao" && <div className="space-y-2 rounded-md border p-3"><div><Label>Redes exigidas para esta pessoa</Label><p className="text-[11px] text-muted-foreground">Vale para as missões atuais e futuras.</p></div><label className="flex items-center gap-2 text-sm"><Checkbox checked={facebook} onCheckedChange={(v) => setFacebook(!!v)} /> Facebook</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={instagram} onCheckedChange={(v) => setInstagram(!!v)} /> Instagram</label><Button type="button" size="sm" variant="outline" disabled={salvando || (!facebook && !instagram)} onClick={salvarRedes}>Salvar redes</Button></div>}<div className="space-y-2 rounded-md border p-3"><Label htmlFor="motivo-correcao">Motivo da correção *</Label><Textarea id="motivo-correcao" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: realizou a missão, mas ocorreu falha no registro" /><p className="flex gap-1 text-[11px] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 shrink-0" />A alteração fica registrada com usuário, data e motivo.</p></div><DialogFooter>{manual && concluida ? <Button variant="destructive" disabled={salvando || motivo.trim().length < 5} onClick={() => salvarConclusao(false)}>Desfazer correção manual</Button> : <Button disabled={salvando || concluida || motivo.trim().length < 5} onClick={() => salvarConclusao(true)}>Marcar como concluída</Button>}</DialogFooter></div>}</DialogContent></Dialog>
  </Card>;
}
