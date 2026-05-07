import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Search, Sparkles, Flag, Calendar, MapPin, ExternalLink, AlertTriangle, CheckCircle2, Clock, XCircle, PauseCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const STATUS_META: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  aberta:        { label: "Aberta",        icon: Clock,        color: "text-amber-700 dark:text-amber-300",   bg: "bg-amber-500/10 border-amber-500/30" },
  em_andamento:  { label: "Em andamento",  icon: Sparkles,     color: "text-blue-700 dark:text-blue-300",     bg: "bg-blue-500/10 border-blue-500/30" },
  cumprida:      { label: "Cumprida",      icon: CheckCircle2, color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/30" },
  quebrada:      { label: "Quebrada",      icon: XCircle,      color: "text-red-700 dark:text-red-300",       bg: "bg-red-500/10 border-red-500/30" },
  adiada:        { label: "Adiada",        icon: PauseCircle,  color: "text-slate-700 dark:text-slate-300",   bg: "bg-slate-500/10 border-slate-500/30" },
};

const TIPO_LABEL: Record<string, string> = {
  saude: "Saúde", educacao: "Educação", infraestrutura: "Infraestrutura",
  seguranca: "Segurança", economia: "Economia", social: "Social",
  meio_ambiente: "Meio ambiente", outro: "Outro",
};

function diasRestantes(prazo?: string | null): number | null {
  if (!prazo) return null;
  const d = new Date(prazo + "T00:00:00");
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((d.getTime() - today.getTime()) / (1000*60*60*24));
}

export function PromessasPanel({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroBairro, setFiltroBairro] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<"kanban" | "lista">("kanban");
  const [extracting, setExtracting] = useState(false);
  const [novaOpen, setNovaOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["ic-promessas", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ic_promessas" as any)
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const filtered = useMemo(() => {
    let l = data ?? [];
    if (filtroStatus !== "todos") l = l.filter(p => p.status === filtroStatus);
    if (filtroTipo !== "todos") l = l.filter(p => p.tipo === filtroTipo);
    if (filtroBairro.trim()) {
      const b = filtroBairro.toLowerCase();
      l = l.filter(p => (p.bairro || "").toLowerCase().includes(b));
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      l = l.filter(p =>
        p.texto?.toLowerCase().includes(s) ||
        p.beneficiario?.toLowerCase().includes(s) ||
        p.notas?.toLowerCase().includes(s)
      );
    }
    return l;
  }, [data, filtroStatus, filtroTipo, filtroBairro, search]);

  const stats = useMemo(() => {
    const all = data ?? [];
    const vencidas = all.filter(p => p.status !== "cumprida" && p.status !== "quebrada" && diasRestantes(p.prazo_data) !== null && (diasRestantes(p.prazo_data) as number) < 0).length;
    return {
      total: all.length,
      abertas: all.filter(p => p.status === "aberta").length,
      andamento: all.filter(p => p.status === "em_andamento").length,
      cumpridas: all.filter(p => p.status === "cumprida").length,
      quebradas: all.filter(p => p.status === "quebrada").length,
      vencidas,
    };
  }, [data]);

  async function extractAll() {
    setExtracting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ic-extract-promessas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ clientId, limit: 100 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha");
      toast.success(`${j.promessas_inseridas} promessas extraídas de ${j.documents} documentos`);
      qc.invalidateQueries({ queryKey: ["ic-promessas", clientId] });
    } catch (e: any) { toast.error(e.message); }
    finally { setExtracting(false); }
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Abertas" value={stats.abertas} color="text-amber-600" />
        <StatCard label="Em andamento" value={stats.andamento} color="text-blue-600" />
        <StatCard label="Cumpridas" value={stats.cumpridas} color="text-emerald-600" />
        <StatCard label="Quebradas" value={stats.quebradas} color="text-red-600" />
        <StatCard label="Vencidas" value={stats.vencidas} color="text-red-600" alert={stats.vencidas > 0} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar promessa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            {Object.entries(STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos tipos</SelectItem>
            {Object.entries(TIPO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Bairro..." value={filtroBairro} onChange={e => setFiltroBairro(e.target.value)} className="w-[140px]" />
        <Button variant={view === "kanban" ? "default" : "outline"} size="sm" onClick={() => setView("kanban")}>Kanban</Button>
        <Button variant={view === "lista" ? "default" : "outline"} size="sm" onClick={() => setView("lista")}>Lista</Button>
        <Button size="sm" variant="outline" onClick={extractAll} disabled={extracting}>
          {extracting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
          Extrair de documentos
        </Button>
        <Button size="sm" onClick={() => setNovaOpen(true)}><Plus className="w-4 h-4 mr-1.5" />Nova</Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando promessas...
        </div>
      ) : (data ?? []).length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground space-y-2">
          <Flag className="w-8 h-8 mx-auto text-muted-foreground/50" />
          <p>Nenhuma promessa rastreada ainda.</p>
          <p className="text-xs">Clique em <strong>Extrair de documentos</strong> para que a IA analise as transcrições e identifique promessas automaticamente.</p>
        </CardContent></Card>
      ) : view === "kanban" ? (
        <KanbanView promessas={filtered} onOpen={setOpenId} clientId={clientId} />
      ) : (
        <ListaView promessas={filtered} onOpen={setOpenId} clientId={clientId} />
      )}

      <PromessaDrawer openId={openId} onClose={() => setOpenId(null)} clientId={clientId} />
      <NovaPromessaDialog open={novaOpen} onClose={() => setNovaOpen(false)} clientId={clientId} />
    </div>
  );
}

function StatCard({ label, value, color, alert }: { label: string; value: number; color?: string; alert?: boolean }) {
  return (
    <Card className={alert ? "border-red-500/40 bg-red-500/5" : ""}>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold ${color || ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function KanbanView({ promessas, onOpen, clientId }: { promessas: any[]; onOpen: (id: string) => void; clientId: string }) {
  const cols = ["aberta", "em_andamento", "cumprida", "quebrada", "adiada"];
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
      {cols.map(col => {
        const meta = STATUS_META[col];
        const Icon = meta.icon;
        const items = promessas.filter(p => p.status === col);
        return (
          <div key={col} className={`rounded-lg border ${meta.bg} p-2 min-h-[200px]`}>
            <div className={`flex items-center gap-1.5 text-xs font-semibold mb-2 ${meta.color}`}>
              <Icon className="w-3.5 h-3.5" /> {meta.label}
              <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
            </div>
            <div className="space-y-2">
              {items.map(p => <PromessaMiniCard key={p.id} p={p} onClick={() => onOpen(p.id)} clientId={clientId} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PromessaMiniCard({ p, onClick, clientId }: { p: any; onClick: () => void; clientId: string }) {
  const dr = diasRestantes(p.prazo_data);
  const overdue = dr !== null && dr < 0 && p.status !== "cumprida" && p.status !== "quebrada";
  const closeToDue = dr !== null && dr >= 0 && dr <= 14;
  return (
    <Card onClick={onClick} className={`cursor-pointer hover:shadow-md transition-shadow ${overdue ? "border-red-500/50" : ""}`}>
      <CardContent className="p-2.5 space-y-1.5">
        <p className="text-xs leading-snug line-clamp-3">{p.texto}</p>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="text-[9px] py-0">{TIPO_LABEL[p.tipo] || p.tipo}</Badge>
          {p.bairro && (
            <Badge variant="secondary" className="text-[9px] py-0 gap-0.5">
              <MapPin className="w-2.5 h-2.5" /> {p.bairro}
            </Badge>
          )}
        </div>
        {p.prazo_texto && (
          <div className={`text-[10px] flex items-center gap-1 ${overdue ? "text-red-600 font-semibold" : closeToDue ? "text-amber-600" : "text-muted-foreground"}`}>
            <Calendar className="w-2.5 h-2.5" />
            {p.prazo_texto}
            {dr !== null && (overdue ? ` (vencida há ${Math.abs(dr)}d)` : ` (${dr}d)`)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ListaView({ promessas, onOpen, clientId }: { promessas: any[]; onOpen: (id: string) => void; clientId: string }) {
  return (
    <div className="space-y-2">
      {promessas.map(p => {
        const meta = STATUS_META[p.status] || STATUS_META.aberta;
        const Icon = meta.icon;
        const dr = diasRestantes(p.prazo_data);
        const overdue = dr !== null && dr < 0 && p.status !== "cumprida" && p.status !== "quebrada";
        return (
          <Card key={p.id} onClick={() => onOpen(p.id)} className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-3 flex items-start gap-3">
              <div className={`shrink-0 ${meta.color}`}><Icon className="w-4 h-4" /></div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="text-sm leading-snug">{p.texto}</p>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">{TIPO_LABEL[p.tipo] || p.tipo}</Badge>
                  {p.bairro && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{p.bairro}</span>}
                  {p.prazo_texto && <span className={`flex items-center gap-0.5 ${overdue ? "text-red-600 font-semibold" : ""}`}><Calendar className="w-3 h-3" />{p.prazo_texto}{dr !== null && (overdue ? ` (-${Math.abs(dr)}d)` : ` (${dr}d)`)}</span>}
                  {Array.isArray(p.evidencias) && p.evidencias.length > 0 && <span>• {p.evidencias.length} evidência(s)</span>}
                </div>
              </div>
              <Badge variant="secondary" className="shrink-0">{meta.label}</Badge>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function PromessaDrawer({ openId, onClose, clientId }: { openId: string | null; onClose: () => void; clientId: string }) {
  const qc = useQueryClient();
  const { data: p } = useQuery({
    queryKey: ["ic-promessa", openId],
    enabled: !!openId,
    queryFn: async () => {
      const { data, error } = await supabase.from("ic_promessas" as any).select("*").eq("id", openId!).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const [novaEvidencia, setNovaEvidencia] = useState("");
  const [notas, setNotas] = useState("");
  const [texto, setTexto] = useState("");
  const [bairro, setBairro] = useState("");
  const [beneficiario, setBeneficiario] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  // Hidrata estado local quando muda a promessa carregada
  useEffect(() => {
    if (p) {
      setTexto(p.texto || "");
      setBairro(p.bairro || "");
      setBeneficiario(p.beneficiario || "");
      setNotas(p.notas || "");
    }
  }, [p?.id]);

  const upd = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await supabase.from("ic_promessas" as any).update(patch).eq("id", openId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ic-promessas", clientId] });
      qc.invalidateQueries({ queryKey: ["ic-promessa", openId] });
      qc.invalidateQueries({ queryKey: ["ic-cobertura", clientId] });
      toast.success("Atualizado");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("ic_promessas" as any).delete().eq("id", openId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ic-promessas", clientId] });
      qc.invalidateQueries({ queryKey: ["ic-cobertura", clientId] });
      toast.success("Removida"); onClose();
      setConfirmDel(false);
    },
    onError: (e: any) => { toast.error(e.message); setConfirmDel(false); },
  });

  const saveIfChanged = (field: string, current: string, original: string | null | undefined) => {
    const curTrim = current.trim();
    const orig = (original || "").trim();
    if (curTrim === orig) return;
    upd.mutate({ [field]: curTrim || null });
  };

  return (
    <Sheet open={!!openId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader><SheetTitle className="flex items-center gap-2"><Flag className="w-4 h-4 text-primary" />Editar promessa</SheetTitle></SheetHeader>
        {p && (
          <div className="mt-4 space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Texto da promessa</label>
              <Textarea
                value={texto}
                onChange={e => setTexto(e.target.value)}
                onBlur={() => { if (texto.trim()) saveIfChanged("texto", texto, p.texto); }}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Tipo</label>
                <Select value={p.tipo} onValueChange={(v) => upd.mutate({ tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Status</label>
                <Select value={p.status} onValueChange={(v) => upd.mutate({ status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Bairro</label>
                <Input
                  value={bairro}
                  onChange={e => setBairro(e.target.value)}
                  onBlur={() => saveIfChanged("bairro", bairro, p.bairro)}
                  placeholder="ex: Centro"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Beneficiário</label>
                <Input
                  value={beneficiario}
                  onChange={e => setBeneficiario(e.target.value)}
                  onBlur={() => saveIfChanged("beneficiario", beneficiario, p.beneficiario)}
                  placeholder="ex: famílias do bairro"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Prazo (texto)</label>
                <Input
                  defaultValue={p.prazo_texto || ""}
                  onBlur={e => { const v = e.target.value.trim(); if (v !== (p.prazo_texto || "")) upd.mutate({ prazo_texto: v || null }); }}
                  placeholder="ex: junho de 2025"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Prazo (data)</label>
                <Input type="date" value={p.prazo_data || ""} onChange={e => upd.mutate({ prazo_data: e.target.value || null })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Evidências de cumprimento</label>
              <div className="space-y-1.5">
                {(p.evidencias || []).map((ev: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-muted/50 rounded p-2">
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    <a href={ev.url} target="_blank" rel="noreferrer" className="truncate flex-1 hover:underline">{ev.descricao || ev.url}</a>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => upd.mutate({ evidencias: (p.evidencias || []).filter((_:any,idx:number)=>idx!==i) })}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input placeholder="URL ou descrição da evidência" value={novaEvidencia} onChange={e => setNovaEvidencia(e.target.value)} />
                <Button size="sm" onClick={() => {
                  if (!novaEvidencia.trim()) return;
                  const isUrl = /^https?:\/\//.test(novaEvidencia);
                  const ev = isUrl ? { url: novaEvidencia, descricao: novaEvidencia } : { descricao: novaEvidencia };
                  upd.mutate({ evidencias: [...(p.evidencias || []), ev] });
                  setNovaEvidencia("");
                }}>+</Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Notas internas</label>
              <Textarea value={notas} onChange={e => setNotas(e.target.value)} onBlur={() => { if (notas !== (p.notas || "")) upd.mutate({ notas: notas || null }); }} rows={3} />
            </div>

            {p.documento_origem_id && (
              <div className="text-xs text-muted-foreground">
                Origem: documento <code className="text-[10px]">{String(p.documento_origem_id).slice(0,8)}</code>
              </div>
            )}

            {!confirmDel ? (
              <Button variant="destructive" size="sm" onClick={() => setConfirmDel(true)}>
                <Trash2 className="w-4 h-4 mr-1.5" />Remover promessa
              </Button>
            ) : (
              <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3 space-y-2">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400">Confirmar exclusão? Esta ação não pode ser desfeita.</p>
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={() => del.mutate()} disabled={del.isPending}>
                    {del.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
                    Sim, remover
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfirmDel(false)}>Cancelar</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function NovaPromessaDialog({ open, onClose, clientId }: { open: boolean; onClose: () => void; clientId: string }) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [tipo, setTipo] = useState("outro");
  const [bairro, setBairro] = useState("");
  const [prazo, setPrazo] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!texto.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("ic_promessas" as any).insert({
        client_id: clientId, texto: texto.trim(), tipo, bairro: bairro.trim() || null,
        prazo_texto: prazo.trim() || null, status: "aberta", evidencias: [],
      });
      if (error) throw error;
      toast.success("Promessa criada");
      qc.invalidateQueries({ queryKey: ["ic-promessas", clientId] });
      setTexto(""); setBairro(""); setPrazo(""); setTipo("outro"); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>Nova promessa manual</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Texto da promessa</label>
            <Textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Tipo</label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TIPO_LABEL).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Bairro (opcional)</label>
            <Input value={bairro} onChange={e => setBairro(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Prazo (texto livre)</label>
            <Input value={prazo} onChange={e => setPrazo(e.target.value)} placeholder="ex: até dezembro" />
          </div>
          <Button onClick={save} disabled={saving || !texto.trim()} className="w-full">
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}Criar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
