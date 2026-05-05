import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Crown, Users, UserCheck, LogOut, Plus, Trash2, Phone, MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Tipo = "coordenador" | "lider" | "cabo";
interface Pessoa {
  id: string; client_id: string; tipo: Tipo;
  escopo: "campo_grande" | "interior";
  regiao: string | null; cidade: string | null;
  nome: string; telefone: string; endereco: string;
  parent_id: string | null; user_id: string | null;
}

const TIPO_META: Record<Tipo, { label: string; color: string; icon: any }> = {
  coordenador: { label: "Coordenador", color: "text-red-600 border-red-500/30 bg-red-500/10", icon: Crown },
  lider: { label: "Líder", color: "text-blue-600 border-blue-500/30 bg-blue-500/10", icon: Users },
  cabo: { label: "Cabo", color: "text-green-600 border-green-500/30 bg-green-500/10", icon: UserCheck },
};

export default function PortalCoordenador() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Pessoa | null>(null);
  const [team, setTeam] = useState<Pessoa[]>([]);
  const [clientName, setClientName] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    tipo: "lider" as Tipo,
    nome: "", telefone: "", endereco: "",
    parent_id: "" as string,
  });

  useEffect(() => { load(); }, [clientId]);

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate(`/portal/${clientId}`); return; }
    const { data: cl } = await supabase.from("clients").select("name").eq("id", clientId!).maybeSingle();
    if (cl) setClientName(cl.name);

    const { data: meRow } = await supabase.from("eleicao_pessoas" as any)
      .select("*").eq("user_id", session.user.id).eq("client_id", clientId!).eq("tipo", "coordenador")
      .maybeSingle();
    if (!meRow) { navigate(`/portal/${clientId}`); return; }
    setMe(meRow as any);

    // RLS: tudo na minha árvore
    const { data: tr } = await supabase.from("eleicao_pessoas" as any)
      .select("*").eq("client_id", clientId!).order("nome");
    setTeam((tr as any) || []);
    setLoading(false);
  }

  function openNew(tipo: Tipo, parent_id = "") {
    setForm({ tipo, nome: "", telefone: "", endereco: "", parent_id });
    setDialogOpen(true);
  }

  async function save() {
    if (!me) return;
    if (!form.nome.trim() || !form.telefone.trim() || !form.endereco.trim()) {
      toast.error("Nome, telefone e endereço são obrigatórios"); return;
    }
    const parent = form.parent_id || me.id; // default: vincula a mim
    const payload: any = {
      client_id: me.client_id,
      tipo: form.tipo,
      escopo: me.escopo,
      regiao: me.regiao,
      cidade: me.cidade,
      nome: form.nome.trim(),
      telefone: form.telefone.trim(),
      endereco: form.endereco.trim(),
      parent_id: parent,
    };
    const { error } = await supabase.from("eleicao_pessoas" as any).insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Cadastrado!");
    setDialogOpen(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Excluir este cadastro?")) return;
    const { error } = await supabase.from("eleicao_pessoas" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluído");
    load();
  }

  async function logout() {
    await supabase.auth.signOut();
    navigate(`/portal/${clientId}`);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!me) return null;

  const myLideres = team.filter(p => p.tipo === "lider" && p.parent_id === me.id);
  const myCabosDir = team.filter(p => p.tipo === "cabo" && p.parent_id === me.id);
  const totals = { lideres: team.filter(p => p.tipo === "lider").length, cabos: team.filter(p => p.tipo === "cabo").length };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{clientName}</p>
            <h1 className="font-bold flex items-center gap-2"><Crown className="w-4 h-4 text-red-600" />{me.nome}</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}><LogOut className="w-4 h-4 mr-1" />Sair</Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Sua região</p>
            <p className="font-semibold flex items-center gap-1"><MapPin className="w-4 h-4" />
              {me.escopo === "campo_grande" ? `Campo Grande — ${me.regiao}` : me.cidade}
            </p>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div><p className="text-xs text-muted-foreground">Líderes</p><p className="text-2xl font-bold text-blue-600 tabular-nums">{totals.lideres}</p></div>
              <div><p className="text-xs text-muted-foreground">Cabos</p><p className="text-2xl font-bold text-green-600 tabular-nums">{totals.cabos}</p></div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          {me.escopo === "campo_grande" && (
            <Button size="sm" onClick={() => openNew("lider", me.id)}><Plus className="w-3.5 h-3.5 mr-1" />Novo Líder</Button>
          )}
          <Button size="sm" variant="outline" onClick={() => openNew("cabo", me.id)}><Plus className="w-3.5 h-3.5 mr-1" />Novo Cabo eleitoral</Button>
        </div>

        {me.escopo === "campo_grande" && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Meus Líderes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {myLideres.length === 0 && <p className="text-sm text-muted-foreground">Nenhum líder cadastrado ainda.</p>}
              {myLideres.map(l => {
                const cabosDoLider = team.filter(p => p.tipo === "cabo" && p.parent_id === l.id);
                return (
                  <div key={l.id} className="border rounded-lg p-3">
                    <PessoaRow p={l} onDelete={remove} />
                    <div className="ml-4 mt-2 space-y-1">
                      {cabosDoLider.map(cb => <PessoaRow key={cb.id} p={cb} onDelete={remove} small />)}
                    </div>
                    <Button size="sm" variant="ghost" className="mt-2" onClick={() => openNew("cabo", l.id)}>
                      <Plus className="w-3 h-3 mr-1" />Cabo deste líder
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {(myCabosDir.length > 0 || me.escopo === "interior") && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Cabos diretos</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {myCabosDir.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cabo direto.</p>}
              {myCabosDir.map(cb => <PessoaRow key={cb.id} p={cb} onDelete={remove} />)}
            </CardContent>
          </Card>
        )}
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo {TIPO_META[form.tipo].label}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {form.tipo === "cabo" && me.escopo === "campo_grande" && myLideres.length > 0 && (
              <div>
                <Label>Vincular a líder (opcional)</Label>
                <Select value={form.parent_id || me.id} onValueChange={v => setForm(f => ({ ...f, parent_id: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={me.id}>— Direto comigo —</SelectItem>
                    {myLideres.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} /></div>
            <div><Label>Telefone *</Label><Input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="(67) 99999-0000" /></div>
            <div><Label>Endereço *</Label><Input value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} placeholder="Rua, número, bairro" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Cadastrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PessoaRow({ p, onDelete, small }: { p: Pessoa; onDelete: (id: string) => void; small?: boolean }) {
  const meta = TIPO_META[p.tipo];
  const Icon = meta.icon;
  return (
    <div className={cn("group flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/40", small && "text-sm")}>
      <div className={cn("rounded-full flex items-center justify-center shrink-0 border", meta.color, small ? "w-6 h-6" : "w-8 h-8")}>
        <Icon className={small ? "w-3 h-3" : "w-4 h-4"} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{p.nome}</p>
        <p className="text-xs text-muted-foreground truncate flex items-center gap-2">
          <Phone className="w-3 h-3" />{p.telefone}
        </p>
      </div>
      <Badge variant="outline" className={cn("text-[10px]", meta.color)}>{meta.label}</Badge>
      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100" onClick={() => onDelete(p.id)}>
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
