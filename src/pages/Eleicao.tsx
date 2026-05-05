import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { useCurrentClientId } from "@/hooks/ic/useCurrentClientId";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Crown, Users, UserCheck, Plus, Trash2, ChevronRight, MapPin, Phone, Search, Edit2, KeyRound, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Tipo = "coordenador" | "lider" | "cabo";
type Escopo = "campo_grande" | "interior";
type Regiao = "centro" | "segredo" | "prosa" | "bandeira" | "anhanduizinho" | "lagoa" | "moreninha" | "imbirussu";

interface Pessoa {
  id: string;
  client_id: string;
  tipo: Tipo;
  escopo: Escopo;
  regiao: Regiao | null;
  cidade: string | null;
  nome: string;
  telefone: string;
  endereco: string;
  parent_id: string | null;
  observacoes: string | null;
  email: string | null;
  user_id: string | null;
  created_at: string;
}

const REGIOES: { value: Regiao; label: string }[] = [
  { value: "centro", label: "Centro" },
  { value: "segredo", label: "Segredo" },
  { value: "prosa", label: "Prosa" },
  { value: "bandeira", label: "Bandeira" },
  { value: "anhanduizinho", label: "Anhanduizinho" },
  { value: "lagoa", label: "Lagoa" },
  { value: "imbirussu", label: "Imbirussu" },
  { value: "moreninha", label: "Moreninha" },
];

const TIPO_META: Record<Tipo, { label: string; color: string; icon: any }> = {
  coordenador: { label: "Coordenador", color: "bg-red-500/10 text-red-600 border-red-500/30", icon: Crown },
  lider: { label: "Líder", color: "bg-blue-500/10 text-blue-600 border-blue-500/30", icon: Users },
  cabo: { label: "Cabo Eleitoral", color: "bg-green-500/10 text-green-600 border-green-500/30", icon: UserCheck },
};

export default function Eleicao() {
  const { data: clientId } = useCurrentClientId();
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [escopo, setEscopo] = useState<Escopo>("campo_grande");
  const [regiaoFilter, setRegiaoFilter] = useState<Regiao | "all">("all");

  // dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Pessoa | null>(null);
  const [form, setForm] = useState({
    tipo: "coordenador" as Tipo,
    escopo: "campo_grande" as Escopo,
    regiao: "centro" as Regiao,
    cidade: "",
    nome: "",
    telefone: "",
    endereco: "",
    parent_id: "" as string,
    observacoes: "",
  });

  useEffect(() => { if (clientId) load(); }, [clientId]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("eleicao_pessoas" as any)
      .select("*")
      .eq("client_id", clientId!)
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar: " + error.message);
    else setPessoas((data as any) || []);
    setLoading(false);
  }

  function openNew(presets?: Partial<typeof form>) {
    setEditing(null);
    setForm({
      tipo: "coordenador", escopo, regiao: "centro", cidade: "",
      nome: "", telefone: "", endereco: "", parent_id: "", observacoes: "",
      ...presets,
    });
    setDialogOpen(true);
  }

  function openEdit(p: Pessoa) {
    setEditing(p);
    setForm({
      tipo: p.tipo, escopo: p.escopo,
      regiao: (p.regiao || "centro") as Regiao,
      cidade: p.cidade || "",
      nome: p.nome, telefone: p.telefone, endereco: p.endereco,
      parent_id: p.parent_id || "",
      observacoes: p.observacoes || "",
    });
    setDialogOpen(true);
  }

  async function save() {
    if (!form.nome.trim() || !form.telefone.trim() || !form.endereco.trim()) {
      toast.error("Nome, telefone e endereço são obrigatórios"); return;
    }
    if (form.escopo === "interior" && !form.cidade.trim()) {
      toast.error("Cidade é obrigatória para Interior"); return;
    }
    const payload: any = {
      client_id: clientId,
      tipo: form.tipo,
      escopo: form.escopo,
      regiao: form.escopo === "campo_grande" ? form.regiao : null,
      cidade: form.escopo === "interior" ? form.cidade.trim() : null,
      nome: form.nome.trim(),
      telefone: form.telefone.trim(),
      endereco: form.endereco.trim(),
      parent_id: form.parent_id || null,
      observacoes: form.observacoes.trim() || null,
    };
    const q = editing
      ? supabase.from("eleicao_pessoas" as any).update(payload).eq("id", editing.id)
      : supabase.from("eleicao_pessoas" as any).insert(payload);
    const { error } = await q;
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Atualizado!" : "Cadastrado!");
    setDialogOpen(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Excluir este cadastro? As pessoas vinculadas a ele ficarão sem vínculo.")) return;
    const { error } = await supabase.from("eleicao_pessoas" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluído");
    load();
  }

  // ─── Credenciais de Coordenador ────────────────────────────────
  const [credOpen, setCredOpen] = useState(false);
  const [credPessoa, setCredPessoa] = useState<Pessoa | null>(null);
  const [credEmail, setCredEmail] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [credLoading, setCredLoading] = useState(false);

  function openCred(p: Pessoa) {
    setCredPessoa(p);
    setCredEmail(p.email || "");
    setCredPassword("");
    setCredOpen(true);
  }

  async function saveCred() {
    if (!credPessoa) return;
    if (!credEmail.trim() || credPassword.length < 6) {
      toast.error("Email e senha (mín. 6) obrigatórios"); return;
    }
    setCredLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("eleicao-create-account", {
        body: { pessoa_id: credPessoa.id, email: credEmail.trim(), password: credPassword },
      });
      if (error) {
        let msg = error.message;
        try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch {}
        throw new Error(msg);
      }
      if (!data?.success) throw new Error(data?.error || "Falha");
      toast.success("Acesso criado! O coordenador pode entrar no portal.");
      setCredOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCredLoading(false);
    }
  }
  // computed
  const matchesSearch = (p: Pessoa) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.nome.toLowerCase().includes(q) || p.telefone.includes(search) || (p.endereco || "").toLowerCase().includes(q);
  };

  const escopoList = pessoas.filter(p => p.escopo === escopo && matchesSearch(p));
  const cgRegioes = useMemo(() => {
    if (escopo !== "campo_grande") return [];
    return REGIOES.filter(r => regiaoFilter === "all" || r.value === regiaoFilter);
  }, [escopo, regiaoFilter]);

  const interiorCidades = useMemo(() => {
    if (escopo !== "interior") return [];
    const set = new Set(escopoList.map(p => p.cidade || "").filter(Boolean));
    return Array.from(set).sort();
  }, [escopo, escopoList]);

  const stats = useMemo(() => {
    const f = pessoas.filter(p => p.escopo === escopo);
    return {
      coord: f.filter(p => p.tipo === "coordenador").length,
      lider: f.filter(p => p.tipo === "lider").length,
      cabo: f.filter(p => p.tipo === "cabo").length,
      total: f.length,
    };
  }, [pessoas, escopo]);

  // potential parents for the form
  const possibleParents = useMemo(() => {
    if (form.tipo === "coordenador") return [];
    const parentTipo: Tipo = form.tipo === "lider" ? "coordenador" : "lider";
    return pessoas.filter(p =>
      p.tipo === parentTipo &&
      p.escopo === form.escopo &&
      (form.escopo === "interior" ? p.cidade === form.cidade : p.regiao === form.regiao)
    );
  }, [pessoas, form.tipo, form.escopo, form.regiao, form.cidade]);

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Eleição</h1>
          <p className="text-sm text-muted-foreground mt-1">Coordenadores, líderes e cabos eleitorais da campanha</p>
        </div>
        <Button onClick={() => openNew()}><Plus className="w-4 h-4 mr-2" />Novo cadastro</Button>
      </div>

      <Tabs value={escopo} onValueChange={(v) => { setEscopo(v as Escopo); setRegiaoFilter("all"); }}>
        <TabsList className="grid grid-cols-2 w-full max-w-md mb-4">
          <TabsTrigger value="campo_grande">Coord. Campo Grande</TabsTrigger>
          <TabsTrigger value="interior">Coord. Interior</TabsTrigger>
        </TabsList>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {([
            { k: "total", label: "Total", color: "text-foreground" },
            { k: "coord", label: "Coordenadores", color: "text-red-600" },
            { k: "lider", label: "Líderes", color: "text-blue-600" },
            { k: "cabo", label: "Cabos eleitorais", color: "text-green-600" },
          ] as const).map(s => (
            <Card key={s.k} className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={cn("text-2xl font-bold tabular-nums", s.color)}>{(stats as any)[s.k]}</p>
            </Card>
          ))}
        </div>

        <Card className="p-3 mb-4 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar por nome, telefone ou endereço..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {escopo === "campo_grande" && (
            <Select value={regiaoFilter} onValueChange={(v) => setRegiaoFilter(v as any)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as regiões</SelectItem>
                {REGIOES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </Card>

        <TabsContent value="campo_grande" className="space-y-4">
          {loading ? <p className="text-center text-muted-foreground py-8">Carregando…</p> :
            cgRegioes.map(r => (
              <RegionBlock
                key={r.value}
                title={r.label}
                pessoas={escopoList.filter(p => p.regiao === r.value)}
                onAdd={() => openNew({ escopo: "campo_grande", regiao: r.value })}
                onEdit={openEdit}
                onDelete={remove}
                onCredentials={openCred}
              />
            ))
          }
        </TabsContent>

        <TabsContent value="interior" className="space-y-4">
          {loading ? <p className="text-center text-muted-foreground py-8">Carregando…</p> :
            interiorCidades.length === 0 ? (
              <Card className="py-12 text-center text-muted-foreground border-dashed">
                <MapPin className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Nenhuma cidade cadastrada ainda</p>
                <Button variant="link" onClick={() => openNew({ escopo: "interior" })}>Cadastrar primeiro coordenador</Button>
              </Card>
            ) : interiorCidades.map(cidade => (
              <RegionBlock
                key={cidade}
                title={cidade}
                pessoas={escopoList.filter(p => p.cidade === cidade)}
                onAdd={() => openNew({ escopo: "interior", cidade })}
                onEdit={openEdit}
                onDelete={remove}
                onCredentials={openCred}
                interior
              />
            ))
          }
        </TabsContent>
      </Tabs>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cadastro" : "Novo cadastro"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm(f => ({ ...f, tipo: v as Tipo, parent_id: "" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="coordenador">Coordenador</SelectItem>
                    {form.escopo === "campo_grande" && <SelectItem value="lider">Líder</SelectItem>}
                    <SelectItem value="cabo">Cabo eleitoral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Escopo *</Label>
                <Select value={form.escopo} onValueChange={(v) => setForm(f => ({ ...f, escopo: v as Escopo, parent_id: "", tipo: v === "interior" && f.tipo === "lider" ? "cabo" : f.tipo }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="campo_grande">Campo Grande</SelectItem>
                    <SelectItem value="interior">Interior</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.escopo === "campo_grande" ? (
              <div>
                <Label>Região *</Label>
                <Select value={form.regiao} onValueChange={(v) => setForm(f => ({ ...f, regiao: v as Regiao, parent_id: "" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REGIOES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label>Cidade *</Label>
                <Input value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value, parent_id: "" }))} placeholder="Ex: Dourados" />
              </div>
            )}

            {form.tipo !== "coordenador" && (
              <div>
                <Label>Indicado por ({form.tipo === "lider" ? "Coordenador" : "Líder"})</Label>
                <Select value={form.parent_id || "none"} onValueChange={(v) => setForm(f => ({ ...f, parent_id: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sem vínculo —</SelectItem>
                    {possibleParents.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                {possibleParents.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Nenhum {form.tipo === "lider" ? "coordenador" : "líder"} cadastrado nesta {form.escopo === "campo_grande" ? "região" : "cidade"} ainda.</p>
                )}
              </div>
            )}

            <div>
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Telefone *</Label>
                <Input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="(67) 99999-0000" />
              </div>
            </div>
            <div>
              <Label>Endereço *</Label>
              <Input value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} placeholder="Rua, número, bairro" />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea rows={2} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editing ? "Salvar" : "Cadastrar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RegionBlock({
  title, pessoas, onAdd, onEdit, onDelete, onCredentials, interior,
}: {
  title: string;
  pessoas: Pessoa[];
  onAdd: () => void;
  onEdit: (p: Pessoa) => void;
  onCredentials: (p: Pessoa) => void;
  onDelete: (id: string) => void;
  interior?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const coords = pessoas.filter(p => p.tipo === "coordenador");
  const lideresOrfaos = pessoas.filter(p => p.tipo === "lider" && !p.parent_id);
  const cabosOrfaos = pessoas.filter(p => p.tipo === "cabo" && !p.parent_id);

  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 p-4 hover:bg-muted/40 text-left">
        <ChevronRight className={cn("w-4 h-4 transition-transform", open && "rotate-90")} />
        <MapPin className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">
            {pessoas.length} cadastrados · {coords.length} coord · {pessoas.filter(p => p.tipo === "lider").length} líderes · {pessoas.filter(p => p.tipo === "cabo").length} cabos
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onAdd(); }}>
          <Plus className="w-3.5 h-3.5 mr-1" />Adicionar
        </Button>
      </button>

      {open && (
        <div className="border-t bg-muted/10 divide-y">
          {pessoas.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">Nenhum cadastro nesta {interior ? "cidade" : "região"}</div>
          )}
          {coords.map(c => (
            <CoordBlock key={c.id} coord={c} all={pessoas} onEdit={onEdit} onDelete={onDelete} onCredentials={onCredentials} interior={interior} />
          ))}
          {lideresOrfaos.length > 0 && (
            <div className="p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Líderes sem coordenador</p>
              {lideresOrfaos.map(l => <PessoaRow key={l.id} p={l} all={pessoas} depth={1} onEdit={onEdit} onDelete={onDelete} onCredentials={onCredentials} />)}
            </div>
          )}
          {cabosOrfaos.length > 0 && (
            <div className="p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Cabos sem líder</p>
              {cabosOrfaos.map(c => <PessoaRow key={c.id} p={c} all={pessoas} depth={1} onEdit={onEdit} onDelete={onDelete} onCredentials={onCredentials} />)}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function CoordBlock({ coord, all, onEdit, onDelete, onCredentials, interior }: {
  coord: Pessoa; all: Pessoa[]; onEdit: (p: Pessoa) => void; onDelete: (id: string) => void; onCredentials: (p: Pessoa) => void; interior?: boolean;
}) {
  const lideres = all.filter(p => p.tipo === "lider" && p.parent_id === coord.id);
  const cabosDir = all.filter(p => p.tipo === "cabo" && p.parent_id === coord.id);

  return (
    <div className="p-3">
      <PessoaRow p={coord} all={all} depth={0} onEdit={onEdit} onDelete={onDelete} onCredentials={onCredentials} />
      <div className="ml-6 mt-1 space-y-1">
        {lideres.map(l => {
          const cabos = all.filter(p => p.tipo === "cabo" && p.parent_id === l.id);
          return (
            <div key={l.id}>
              <PessoaRow p={l} all={all} depth={1} onEdit={onEdit} onDelete={onDelete} onCredentials={onCredentials} />
              <div className="ml-6 space-y-1">
                {cabos.map(cb => <PessoaRow key={cb.id} p={cb} all={all} depth={2} onEdit={onEdit} onDelete={onDelete} onCredentials={onCredentials} />)}
              </div>
            </div>
          );
        })}
        {interior && cabosDir.map(cb => <PessoaRow key={cb.id} p={cb} all={all} depth={1} onEdit={onEdit} onDelete={onDelete} onCredentials={onCredentials} />)}
      </div>
    </div>
  );
}

function PessoaRow({ p, onEdit, onDelete }: { p: Pessoa; all: Pessoa[]; depth: number; onEdit: (p: Pessoa) => void; onDelete: (id: string) => void }) {
  const meta = TIPO_META[p.tipo];
  const Icon = meta.icon;
  return (
    <div className="group flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/40">
      <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0 border", meta.color)}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{p.nome}</p>
        <p className="text-xs text-muted-foreground truncate flex items-center gap-2">
          <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.telefone}</span>
          <span className="truncate">· {p.endereco}</span>
        </p>
      </div>
      <Badge variant="outline" className={cn("text-[10px]", meta.color)}>{meta.label}</Badge>
      <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => onEdit(p)}>
        <Edit2 className="w-3.5 h-3.5" />
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100" onClick={() => onDelete(p.id)}>
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
