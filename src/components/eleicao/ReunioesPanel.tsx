import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  CalendarDays, Plus, Link2, Copy, Trash2, Users, Check, X, Loader2,
  FileSpreadsheet, FileText, MapPin, Clock, ArrowLeft, Search, Lock, Unlock,
} from "lucide-react";
import { resolvePublicBaseUrl } from "@/lib/public-base-url";
import { fmtPhoneBR } from "@/lib/phone-utils";

type Reuniao = {
  id: string;
  titulo: string;
  data_reuniao: string;
  local: string | null;
  observacoes: string | null;
  status: string;
};
type Sessao = {
  id: string;
  reuniao_id: string;
  label: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  vagas: number;
  ordem: number;
};
type LinkRow = { id: string; reuniao_id: string; token: string; label: string; ativo: boolean };
type Inscricao = {
  id: string;
  sessao_id: string;
  link_id: string | null;
  nome: string;
  telefone: string;
  eleicao_pessoa_id: string | null;
  status: string;
  presenca: string | null;
  checkin_em: string | null;
  created_at: string;
};

const fmtDate = (d: string) => {
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
};
const fmtHora = (h: string | null) => (h ? h.slice(0, 5) : "");

export default function ReunioesPanel({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [inscricoes, setInscricoes] = useState<Inscricao[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [novaOpen, setNovaOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [pessoasMap, setPessoasMap] = useState<Record<string, { nome: string; tipo: string; cidade: string | null; regiao: string | null }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data: rs, error } = await supabase
      .from("reunioes" as any)
      .select("*")
      .eq("client_id", clientId)
      .order("data_reuniao", { ascending: false });
    if (error) { toast.error(error.message); setLoading(false); return; }
    const list = (rs as any as Reuniao[]) || [];
    setReunioes(list);
    const ids = list.map((r) => r.id);
    if (ids.length) {
      const [se, li, ins] = await Promise.all([
        supabase.from("reuniao_sessoes" as any).select("*").in("reuniao_id", ids).order("ordem"),
        supabase.from("reuniao_links" as any).select("*").in("reuniao_id", ids).order("created_at"),
        supabase.from("reuniao_inscricoes" as any).select("*").in("reuniao_id", ids).order("created_at"),
      ]);
      setSessoes((se.data as any) || []);
      setLinks((li.data as any) || []);
      setInscricoes((ins.data as any) || []);
    } else {
      setSessoes([]); setLinks([]); setInscricoes([]);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => { if (clientId) load(); }, [clientId, load]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("clients").select("public_base_url").eq("id", clientId).maybeSingle();
      setBaseUrl(resolvePublicBaseUrl(data).url);
      const { data: pp } = await supabase
        .from("eleicao_pessoas" as any)
        .select("id, nome, tipo, cidade, regiao")
        .eq("client_id", clientId);
      const map: Record<string, any> = {};
      ((pp as any[]) || []).forEach((p) => { map[p.id] = p; });
      setPessoasMap(map);
    })();
  }, [clientId]);

  const reuniao = useMemo(() => reunioes.find((r) => r.id === selected) || null, [reunioes, selected]);
  const mySessoes = useMemo(
    () => sessoes.filter((s) => s.reuniao_id === selected).sort((a, b) => a.ordem - b.ordem),
    [sessoes, selected],
  );
  const myLinks = useMemo(() => links.filter((l) => l.reuniao_id === selected), [links, selected]);
  const myInscricoes = useMemo(() => {
    const sids = new Set(mySessoes.map((s) => s.id));
    let base = inscricoes.filter((i) => sids.has(i.sessao_id) && i.status !== "cancelado");
    const q = busca.trim().toLowerCase();
    if (q) {
      const qd = q.replace(/\D/g, "");
      base = base.filter(
        (i) => i.nome.toLowerCase().includes(q) || (qd.length >= 3 && i.telefone.includes(qd)),
      );
    }
    return base;
  }, [inscricoes, mySessoes, busca]);

  const ocupadas = useCallback(
    (sessaoId: string) => inscricoes.filter((i) => i.sessao_id === sessaoId && i.status !== "cancelado").length,
    [inscricoes],
  );

  // ---------- criar reunião ----------
  const [novo, setNovo] = useState({
    titulo: "", data: "", local: "", observacoes: "",
    s1: { label: "Manhã", inicio: "09:00", fim: "11:00", vagas: 20 },
    s2: { label: "Tarde", inicio: "14:00", fim: "16:00", vagas: 20 },
    grupo: "Grupo principal",
  });
  const [saving, setSaving] = useState(false);

  async function criarReuniao() {
    if (!novo.titulo.trim() || !novo.data) { toast.error("Informe título e data."); return; }
    setSaving(true);
    const { data: r, error } = await supabase
      .from("reunioes" as any)
      .insert({
        client_id: clientId,
        titulo: novo.titulo.trim(),
        data_reuniao: novo.data,
        local: novo.local.trim() || null,
        observacoes: novo.observacoes.trim() || null,
      })
      .select("id")
      .single();
    if (error || !r) { toast.error(error?.message || "Erro"); setSaving(false); return; }
    const rid = (r as any).id as string;
    await supabase.from("reuniao_sessoes" as any).insert([
      { reuniao_id: rid, label: novo.s1.label, hora_inicio: novo.s1.inicio || null, hora_fim: novo.s1.fim || null, vagas: Number(novo.s1.vagas) || 0, ordem: 0 },
      { reuniao_id: rid, label: novo.s2.label, hora_inicio: novo.s2.inicio || null, hora_fim: novo.s2.fim || null, vagas: Number(novo.s2.vagas) || 0, ordem: 1 },
    ]);
    await supabase.from("reuniao_links" as any).insert({ reuniao_id: rid, label: novo.grupo.trim() || "Grupo principal" });
    setSaving(false);
    setNovaOpen(false);
    setNovo((n) => ({ ...n, titulo: "", data: "", local: "", observacoes: "" }));
    toast.success("Reunião criada!");
    await load();
    setSelected(rid);
  }

  // ---------- sessões ----------
  async function updateSessao(id: string, patch: Partial<Sessao>) {
    setSessoes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } as Sessao : s)));
    const { error } = await supabase.from("reuniao_sessoes" as any).update(patch).eq("id", id);
    if (error) toast.error(error.message);
  }
  async function addSessao() {
    if (!selected) return;
    const { error } = await supabase.from("reuniao_sessoes" as any).insert({
      reuniao_id: selected, label: "Novo horário", hora_inicio: "10:00", hora_fim: "12:00", vagas: 20, ordem: mySessoes.length,
    });
    if (error) return toast.error(error.message);
    load();
  }
  async function delSessao(id: string) {
    if (ocupadas(id) > 0) { toast.error("Existem inscritos nesse horário."); return; }
    await supabase.from("reuniao_sessoes" as any).delete().eq("id", id);
    load();
  }

  // ---------- links ----------
  const [novoGrupo, setNovoGrupo] = useState("");
  async function addLink() {
    if (!selected || !novoGrupo.trim()) { toast.error("Informe o nome do grupo."); return; }
    const { error } = await supabase.from("reuniao_links" as any).insert({ reuniao_id: selected, label: novoGrupo.trim() });
    if (error) return toast.error(error.message);
    setNovoGrupo("");
    load();
  }
  async function toggleLink(l: LinkRow) {
    await supabase.from("reuniao_links" as any).update({ ativo: !l.ativo }).eq("id", l.id);
    load();
  }
  const linkUrl = (token: string) => `${baseUrl}/reuniao/${token}`;
  function copiar(text: string, msg = "Copiado!") {
    navigator.clipboard.writeText(text).then(() => toast.success(msg));
  }
  function mensagemWhats(l: LinkRow) {
    if (!reuniao) return "";
    const horarios = mySessoes
      .map((s) => `• ${s.label}${s.hora_inicio ? ` (${fmtHora(s.hora_inicio)}${s.hora_fim ? ` às ${fmtHora(s.hora_fim)}` : ""})` : ""} — ${s.vagas} vagas`)
      .join("\n");
    return `📅 *${reuniao.titulo}*\nData: ${fmtDate(reuniao.data_reuniao)}${reuniao.local ? `\nLocal: ${reuniao.local}` : ""}\n\nHorários disponíveis:\n${horarios}\n\nConfirme sua presença escolhendo o horário:\n${linkUrl(l.token)}`;
  }

  // ---------- check-in ----------
  async function setPresenca(i: Inscricao, presenca: "presente" | "faltou" | null) {
    const patch = { presenca, checkin_em: presenca ? new Date().toISOString() : null };
    setInscricoes((prev) => prev.map((x) => (x.id === i.id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("reuniao_inscricoes" as any).update(patch).eq("id", i.id);
    if (error) { toast.error(error.message); load(); }
  }
  async function cancelarInscricao(i: Inscricao) {
    await supabase.from("reuniao_inscricoes" as any).update({ status: "cancelado" }).eq("id", i.id);
    toast.success("Inscrição cancelada — vaga liberada.");
    load();
  }
  async function toggleStatusReuniao() {
    if (!reuniao) return;
    const next = reuniao.status === "aberta" ? "encerrada" : "aberta";
    await supabase.from("reunioes" as any).update({ status: next }).eq("id", reuniao.id);
    toast.success(next === "aberta" ? "Inscrições reabertas." : "Inscrições encerradas.");
    load();
  }
  async function excluirReuniao() {
    if (!reuniao) return;
    if (!confirm("Excluir a reunião e todas as inscrições?")) return;
    await supabase.from("reunioes" as any).delete().eq("id", reuniao.id);
    setSelected(null);
    load();
  }

  // ---------- exportação ----------
  function rowsForExport() {
    return myInscricoes.map((i) => {
      const s = mySessoes.find((x) => x.id === i.sessao_id);
      const l = myLinks.find((x) => x.id === i.link_id);
      const p = i.eleicao_pessoa_id ? pessoasMap[i.eleicao_pessoa_id] : undefined;
      return {
        Nome: i.nome,
        Telefone: fmtPhoneBR(i.telefone),
        Horário: s?.label || "",
        Grupo: l?.label || "—",
        Cargo: p?.tipo || "não cadastrado",
        Cidade: p?.cidade || "",
        Região: p?.regiao || "",
        Presença: i.presenca === "presente" ? "PRESENTE" : i.presenca === "faltou" ? "FALTOU" : "—",
        "Inscrito em": new Date(i.created_at).toLocaleString("pt-BR"),
      };
    });
  }
  async function exportXlsx() {
    if (!reuniao) return;
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(rowsForExport());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inscritos");
    XLSX.writeFile(wb, `reuniao-${reuniao.data_reuniao}-inscritos.xlsx`);
  }
  async function exportPdf() {
    if (!reuniao) return;
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text(reuniao.titulo, 14, 14);
    doc.setFontSize(10);
    doc.text(`${fmtDate(reuniao.data_reuniao)}${reuniao.local ? ` — ${reuniao.local}` : ""}`, 14, 20);

    let y = 26;
    mySessoes.forEach((s) => {
      const list = myInscricoes.filter((i) => i.sessao_id === s.id);
      const presentes = list.filter((i) => i.presenca === "presente").length;
      doc.setFontSize(11);
      doc.text(
        `${s.label} ${s.hora_inicio ? `(${fmtHora(s.hora_inicio)}${s.hora_fim ? `-${fmtHora(s.hora_fim)}` : ""})` : ""} — ${list.length}/${s.vagas} inscritos • ${presentes} presentes`,
        14, y,
      );
      autoTable(doc, {
        startY: y + 3,
        head: [["Nome", "Telefone", "Grupo", "Cargo", "Cidade", "Presença"]],
        body: list.map((i) => {
          const l = myLinks.find((x) => x.id === i.link_id);
          const p = i.eleicao_pessoa_id ? pessoasMap[i.eleicao_pessoa_id] : undefined;
          return [
            i.nome, fmtPhoneBR(i.telefone), l?.label || "—", p?.tipo || "não cadastrado",
            p?.cidade || "", i.presenca === "presente" ? "PRESENTE" : i.presenca === "faltou" ? "FALTOU" : "—",
          ];
        }),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 99, 235] },
      });
      y = ((doc as any).lastAutoTable?.finalY || y) + 10;
    });
    doc.save(`reuniao-${reuniao.data_reuniao}-presenca.pdf`);
  }

  // ---------- render ----------
  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground p-6"><Loader2 className="w-4 h-4 animate-spin" /> Carregando reuniões...</div>;
  }

  if (!reuniao) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2"><CalendarDays className="w-5 h-5 text-primary" /> Reuniões</h2>
            <p className="text-sm text-muted-foreground">
              Crie a reunião, defina os horários e as vagas, gere um link por grupo de WhatsApp e acompanhe quem confirmou presença.
            </p>
          </div>
          <Button onClick={() => setNovaOpen(true)}><Plus className="w-4 h-4 mr-2" /> Nova reunião</Button>
        </div>

        {reunioes.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma reunião criada. Clique em "Nova reunião" para começar.
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {reunioes.map((r) => {
              const ss = sessoes.filter((s) => s.reuniao_id === r.id);
              const total = ss.reduce((a, s) => a + s.vagas, 0);
              const insc = inscricoes.filter((i) => ss.some((s) => s.id === i.sessao_id) && i.status !== "cancelado");
              const presentes = insc.filter((i) => i.presenca === "presente").length;
              return (
                <Card key={r.id} className="p-4 space-y-2 hover:border-primary/40 transition cursor-pointer" onClick={() => setSelected(r.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold">{r.titulo}</div>
                    <Badge variant={r.status === "aberta" ? "default" : "secondary"} className="text-[10px]">
                      {r.status === "aberta" ? "Inscrições abertas" : "Encerrada"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                    <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> {fmtDate(r.data_reuniao)}</span>
                    {r.local && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {r.local}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Badge variant="outline" className="text-[10px]"><Users className="w-3 h-3 mr-1" /> {insc.length}/{total} vagas</Badge>
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">{presentes} presentes</Badge>
                    <Badge variant="outline" className="text-[10px]">{ss.length} horário(s)</Badge>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <NovaReuniaoDialog open={novaOpen} setOpen={setNovaOpen} novo={novo} setNovo={setNovo} saving={saving} onSave={criarReuniao} />
      </div>
    );
  }

  const totalVagas = mySessoes.reduce((a, s) => a + s.vagas, 0);
  const presentes = myInscricoes.filter((i) => i.presenca === "presente").length;
  const faltas = myInscricoes.filter((i) => i.presenca === "faltou").length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="-ml-2 h-7" onClick={() => setSelected(null)}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Voltar às reuniões
          </Button>
          <h2 className="text-lg font-semibold">{reuniao.titulo}</h2>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
            <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> {fmtDate(reuniao.data_reuniao)}</span>
            {reuniao.local && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {reuniao.local}</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={toggleStatusReuniao}>
            {reuniao.status === "aberta" ? <><Lock className="w-3.5 h-3.5 mr-1.5" /> Encerrar inscrições</> : <><Unlock className="w-3.5 h-3.5 mr-1.5" /> Reabrir inscrições</>}
          </Button>
          <Button variant="outline" size="sm" onClick={exportXlsx}><FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" /> Excel</Button>
          <Button variant="outline" size="sm" onClick={exportPdf}><FileText className="w-3.5 h-3.5 mr-1.5" /> PDF</Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={excluirReuniao}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
        <Card className="p-3"><div className="text-xs text-muted-foreground">Inscritos</div><div className="text-xl font-bold">{myInscricoes.length}<span className="text-sm text-muted-foreground font-normal">/{totalVagas}</span></div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Vagas restantes</div><div className="text-xl font-bold">{Math.max(0, totalVagas - myInscricoes.length)}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Presentes</div><div className="text-xl font-bold text-emerald-600">{presentes}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Faltas</div><div className="text-xl font-bold text-destructive">{faltas}</div></Card>
      </div>

      <Tabs defaultValue="inscritos">
        <TabsList>
          <TabsTrigger value="inscritos"><Users className="w-3.5 h-3.5 mr-1.5" /> Inscritos / Check-in</TabsTrigger>
          <TabsTrigger value="links"><Link2 className="w-3.5 h-3.5 mr-1.5" /> Links por grupo</TabsTrigger>
          <TabsTrigger value="horarios"><Clock className="w-3.5 h-3.5 mr-1.5" /> Horários e vagas</TabsTrigger>
        </TabsList>

        <TabsContent value="inscritos" className="space-y-3 mt-3">
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por nome ou telefone..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          {mySessoes.map((s) => {
            const list = myInscricoes.filter((i) => i.sessao_id === s.id);
            return (
              <Card key={s.id} className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="font-semibold text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" /> {s.label}
                    {s.hora_inicio && <span className="text-xs text-muted-foreground font-normal">{fmtHora(s.hora_inicio)}{s.hora_fim ? ` às ${fmtHora(s.hora_fim)}` : ""}</span>}
                  </div>
                  <Badge variant={ocupadas(s.id) >= s.vagas ? "destructive" : "outline"} className="text-[10px]">
                    {ocupadas(s.id)}/{s.vagas} vagas
                  </Badge>
                </div>
                {list.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-2">Nenhum inscrito nesse horário.</div>
                ) : (
                  <div className="divide-y">
                    {list.map((i) => {
                      const l = myLinks.find((x) => x.id === i.link_id);
                      const p = i.eleicao_pessoa_id ? pessoasMap[i.eleicao_pessoa_id] : undefined;
                      return (
                        <div key={i.id} className="py-2 flex items-center justify-between gap-2 flex-wrap">
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate flex items-center gap-1.5">
                              {i.nome}
                              {i.presenca === "presente" && <Badge className="h-4 text-[9px] bg-emerald-600">presente</Badge>}
                              {i.presenca === "faltou" && <Badge variant="destructive" className="h-4 text-[9px]">faltou</Badge>}
                            </div>
                            <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2">
                              <span>{fmtPhoneBR(i.telefone)}</span>
                              {l && <span>• {l.label}</span>}
                              {p ? <span>• {p.tipo}{p.cidade ? ` — ${p.cidade}` : ""}</span> : <span className="text-amber-600">• sem cadastro na eleição</span>}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" variant={i.presenca === "presente" ? "default" : "outline"} className="h-7 px-2"
                              onClick={() => setPresenca(i, i.presenca === "presente" ? null : "presente")}>
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant={i.presenca === "faltou" ? "destructive" : "outline"} className="h-7 px-2"
                              onClick={() => setPresenca(i, i.presenca === "faltou" ? null : "faltou")}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => cancelarInscricao(i)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="links" className="space-y-3 mt-3">
          <Card className="p-3 space-y-2">
            <Label className="text-xs">Criar link para um grupo</Label>
            <div className="flex gap-2">
              <Input placeholder='Ex.: "Grupo Coordenadores Zona 3"' value={novoGrupo} onChange={(e) => setNovoGrupo(e.target.value)} />
              <Button onClick={addLink}><Plus className="w-4 h-4 mr-1.5" /> Gerar link</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Cada link identifica de qual grupo veio a inscrição.</p>
          </Card>
          {myLinks.map((l) => (
            <Card key={l.id} className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-medium text-sm flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-primary" /> {l.label}
                  <Badge variant="outline" className="text-[10px]">
                    {inscricoes.filter((i) => i.link_id === l.id && i.status !== "cancelado").length} inscrições
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{l.ativo ? "Ativo" : "Desativado"}</span>
                  <Switch checked={l.ativo} onCheckedChange={() => toggleLink(l)} />
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Input readOnly value={linkUrl(l.token)} className="text-xs font-mono h-8 flex-1 min-w-[220px]" />
                <Button size="sm" variant="outline" className="h-8" onClick={() => copiar(linkUrl(l.token), "Link copiado!")}>
                  <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar link
                </Button>
                <Button size="sm" className="h-8" onClick={() => copiar(mensagemWhats(l), "Mensagem copiada!")}>
                  Copiar mensagem p/ WhatsApp
                </Button>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="horarios" className="space-y-3 mt-3">
          {mySessoes.map((s) => (
            <Card key={s.id} className="p-3 grid gap-2 md:grid-cols-5 items-end">
              <div className="md:col-span-2">
                <Label className="text-xs">Nome do horário</Label>
                <Input value={s.label} onChange={(e) => updateSessao(s.id, { label: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Início</Label>
                <Input type="time" value={fmtHora(s.hora_inicio)} onChange={(e) => updateSessao(s.id, { hora_inicio: e.target.value || null })} />
              </div>
              <div>
                <Label className="text-xs">Fim</Label>
                <Input type="time" value={fmtHora(s.hora_fim)} onChange={(e) => updateSessao(s.id, { hora_fim: e.target.value || null })} />
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label className="text-xs">Vagas</Label>
                  <Input type="number" min={0} value={s.vagas} onChange={(e) => updateSessao(s.id, { vagas: Number(e.target.value) || 0 })} />
                </div>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => delSessao(s.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
          <Button variant="outline" onClick={addSessao}><Plus className="w-4 h-4 mr-1.5" /> Adicionar horário</Button>
        </TabsContent>
      </Tabs>

      <NovaReuniaoDialog open={novaOpen} setOpen={setNovaOpen} novo={novo} setNovo={setNovo} saving={saving} onSave={criarReuniao} />
    </div>
  );
}

function NovaReuniaoDialog({
  open, setOpen, novo, setNovo, saving, onSave,
}: {
  open: boolean; setOpen: (v: boolean) => void; novo: any; setNovo: (f: any) => void; saving: boolean; onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova reunião</DialogTitle>
          <DialogDescription>Defina os horários e as vagas. Você pode alterar tudo depois.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Título *</Label>
            <Input value={novo.titulo} onChange={(e) => setNovo((n: any) => ({ ...n, titulo: e.target.value }))} placeholder="Reunião de coordenadores" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Data *</Label>
              <Input type="date" value={novo.data} onChange={(e) => setNovo((n: any) => ({ ...n, data: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Local</Label>
              <Input value={novo.local} onChange={(e) => setNovo((n: any) => ({ ...n, local: e.target.value }))} placeholder="Comitê central" />
            </div>
          </div>
          {(["s1", "s2"] as const).map((k) => (
            <div key={k} className="grid grid-cols-4 gap-2 items-end">
              <div>
                <Label className="text-xs">Horário</Label>
                <Input value={novo[k].label} onChange={(e) => setNovo((n: any) => ({ ...n, [k]: { ...n[k], label: e.target.value } }))} />
              </div>
              <div>
                <Label className="text-xs">Início</Label>
                <Input type="time" value={novo[k].inicio} onChange={(e) => setNovo((n: any) => ({ ...n, [k]: { ...n[k], inicio: e.target.value } }))} />
              </div>
              <div>
                <Label className="text-xs">Fim</Label>
                <Input type="time" value={novo[k].fim} onChange={(e) => setNovo((n: any) => ({ ...n, [k]: { ...n[k], fim: e.target.value } }))} />
              </div>
              <div>
                <Label className="text-xs">Vagas</Label>
                <Input type="number" min={0} value={novo[k].vagas} onChange={(e) => setNovo((n: any) => ({ ...n, [k]: { ...n[k], vagas: Number(e.target.value) || 0 } }))} />
              </div>
            </div>
          ))}
          <div>
            <Label className="text-xs">Nome do primeiro link (grupo)</Label>
            <Input value={novo.grupo} onChange={(e) => setNovo((n: any) => ({ ...n, grupo: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Observações (aparecem no formulário)</Label>
            <Textarea rows={2} value={novo.observacoes} onChange={(e) => setNovo((n: any) => ({ ...n, observacoes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Criar reunião
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
