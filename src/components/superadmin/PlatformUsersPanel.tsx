import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, Users, Loader2, Trash2, Pencil, Eye, EyeOff, KeyRound, Power, Crown } from "lucide-react";
import { ALL_APP_TABS, SECTION_ORDER, tabsBySection } from "@/lib/access-control";
import ResetPasswordDialog from "@/components/team/ResetPasswordDialog";

interface TeamUser {
  id: string;
  user_id: string;
  client_id: string;
  name: string;
  email: string;
  allowed_paths: string[];
  is_manager: boolean;
  status: string;
  created_at: string;
}
interface ClientRow { id: string; name: string }

const TOTAL_TABS = ALL_APP_TABS.length;

export default function PlatformUsersPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeamUser | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", client_id: "" });
  const [isManager, setIsManager] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [paths, setPaths] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [filterClient, setFilterClient] = useState<string>("all");
  const [resetTarget, setResetTarget] = useState<TeamUser | null>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ["all-clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      return (data || []) as ClientRow[];
    },
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["team-users", filterClient],
    queryFn: async () => {
      let q = supabase
        .from("team_members")
        .select("id, user_id, client_id, name, email, allowed_paths, is_manager, status, created_at")
        .order("created_at", { ascending: false });
      if (filterClient !== "all") q = q.eq("client_id", filterClient);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as TeamUser[];
    },
  });

  const reset = () => {
    setEditing(null);
    setForm({ name: "", email: "", password: "", client_id: filterClient !== "all" ? filterClient : "" });
    setPaths([]);
    setIsManager(false);
    setShowPwd(false);
  };

  const openCreate = () => { reset(); setOpen(true); };

  const openEdit = (u: TeamUser) => {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: "", client_id: u.client_id });
    setPaths(u.allowed_paths || []);
    setIsManager(!!u.is_manager);
    setOpen(true);
  };

  const togglePath = (p: string) =>
    setPaths((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  const toggleSection = (section: string, on: boolean) => {
    const inSection = ALL_APP_TABS.filter((t) => t.section === section).map((t) => t.path);
    setPaths((prev) => {
      const filtered = prev.filter((p) => !inSection.includes(p));
      return on ? [...filtered, ...inSection] : filtered;
    });
  };
  const setAll = (on: boolean) => setPaths(on ? ALL_APP_TABS.map((t) => t.path) : []);

  const handleSave = async () => {
    if (!form.name || !form.email) return toast.error("Nome e email são obrigatórios");
    if (!form.client_id) return toast.error("Selecione o cliente (vereador) ao qual o usuário pertence");
    if (!editing && !form.password) return toast.error("Senha é obrigatória");
    if (form.password && form.password.length < 6) return toast.error("Senha mínima de 6 caracteres");
    if (!isManager && paths.length === 0) return toast.error("Marque pelo menos uma aba ou ative 'Gerente do cliente'");

    setSaving(true);
    try {
      const body: any = editing
        ? {
            action: "update",
            id: editing.id,
            name: form.name,
            allowed_paths: paths,
            is_manager: isManager,
            password: form.password || undefined,
          }
        : {
            action: "create",
            client_id: form.client_id,
            name: form.name,
            email: form.email,
            password: form.password,
            allowed_paths: paths,
            is_manager: isManager,
          };

      const { data, error } = await supabase.functions.invoke("manage-platform-user", { body });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast.success(editing ? "Acessos atualizados" : "Usuário criado");
      setOpen(false);
      reset();
      qc.invalidateQueries({ queryKey: ["team-users"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (u: TeamUser) => {
    const next = u.status === "active" ? "disabled" : "active";
    try {
      const { error } = await supabase.functions.invoke("manage-platform-user", {
        body: { action: "update", id: u.id, status: next },
      });
      if (error) throw error;
      toast.success(next === "active" ? "Usuário reativado" : "Usuário desativado");
      qc.invalidateQueries({ queryKey: ["team-users"] });
    } catch (err: any) { toast.error(err.message || "Erro"); }
  };

  const handleDelete = async (u: TeamUser) => {
    if (!confirm(`Excluir ${u.name}? Esta ação não pode ser desfeita.`)) return;
    try {
      const { error } = await supabase.functions.invoke("manage-platform-user", {
        body: { action: "delete", id: u.id },
      });
      if (error) throw error;
      toast.success("Usuário removido");
      qc.invalidateQueries({ queryKey: ["team-users"] });
    } catch (err: any) { toast.error(err.message || "Erro"); }
  };

  const grouped = tabsBySection();
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name || "—";

  return (
    <Card className="bg-slate-800/60 border-slate-700">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Users className="w-4 h-4" /> Usuários por cliente
          </CardTitle>
          <CardDescription className="text-slate-400">
            Cada usuário pertence a um cliente (vereador). O gerente do cliente tem acesso total e pode cadastrar a equipe dele.
          </CardDescription>
        </div>
        <div className="flex gap-2 shrink-0">
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="w-48 h-9 bg-slate-700 border-slate-600 text-white text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={openCreate} className="bg-amber-500 hover:bg-amber-600 text-white">
            <UserPlus className="w-4 h-4 mr-1" /> Novo usuário
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
        ) : users.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">Nenhum usuário cadastrado.</p>
        ) : (
          users.map((u) => {
            const count = (u.allowed_paths || []).length;
            return (
              <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/50 border border-slate-600/50">
                <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center shrink-0">
                  <span className="text-primary text-sm font-bold">{u.name.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white text-sm font-medium truncate">{u.name}</p>
                    {u.is_manager && (
                      <Badge className="text-[10px] bg-amber-500/20 text-amber-300 border-amber-500/30">
                        <Crown className="w-3 h-3 mr-1 inline" />Gerente
                      </Badge>
                    )}
                    {u.status === "disabled" && (
                      <Badge className="text-[10px] bg-red-500/20 text-red-400 border-red-500/30">Desativado</Badge>
                    )}
                  </div>
                  <p className="text-slate-400 text-xs truncate">{u.email}</p>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Cliente: <span className="text-slate-300">{clientName(u.client_id)}</span>
                    {" · "}
                    {u.is_manager ? "acesso total" : `${count} de ${TOTAL_TABS} abas`}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-300 hover:text-white" onClick={() => openEdit(u)} title="Editar acessos">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-300 hover:text-amber-300" onClick={() => setResetTarget(u)} title="Redefinir senha">
                    <KeyRound className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-300 hover:text-amber-400" onClick={() => handleToggleStatus(u)} title={u.status === "active" ? "Desativar" : "Reativar"}>
                    <Power className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-500 hover:text-red-400" onClick={() => handleDelete(u)} title="Excluir">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar usuário" : "Novo usuário"}</DialogTitle>
            <DialogDescription>
              Vincule o usuário a um cliente (vereador). Marque "Gerente do cliente" para acesso total ou escolha as abas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs">Cliente (vereador)</Label>
              <Select value={form.client_id} disabled={!!editing} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nome</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input type="email" value={form.email} disabled={!!editing} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs flex items-center gap-1">
                  <KeyRound className="w-3 h-3" />
                  {editing ? "Nova senha (opcional)" : "Senha"}
                </Label>
                <div className="relative">
                  <Input
                    type={showPwd ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editing ? "Deixe em branco para manter a senha atual" : "Mínimo 6 caracteres"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border rounded-md p-3 bg-amber-500/5">
              <div>
                <Label className="text-sm font-semibold flex items-center gap-1">
                  <Crown className="w-4 h-4 text-amber-500" /> Gerente do cliente
                </Label>
                <p className="text-xs text-muted-foreground">Acesso total às abas e poder de cadastrar outros usuários deste cliente.</p>
              </div>
              <Switch checked={isManager} onCheckedChange={setIsManager} />
            </div>

            {!isManager && (
              <div className="border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold">Acesso por aba</Label>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAll(true)}>Liberar tudo</Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAll(false)}>Limpar tudo</Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
                    <Checkbox checked disabled />
                    <span className="text-sm">Dashboard <span className="text-xs text-muted-foreground">(sempre liberado)</span></span>
                  </div>

                  {SECTION_ORDER.map((section) => {
                    const items = grouped[section] || [];
                    if (items.length === 0) return null;
                    const allOn = items.every((i) => paths.includes(i.path));
                    return (
                      <div key={section} className="border rounded-md p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{section}</p>
                          <Button type="button" size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={() => toggleSection(section, !allOn)}>
                            {allOn ? "Limpar seção" : "Liberar seção"}
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                          {items.map((tab) => {
                            const checked = paths.includes(tab.path);
                            return (
                              <label key={tab.path} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
                                <Checkbox checked={checked} onCheckedChange={() => togglePath(tab.path)} />
                                <span className="text-sm">{tab.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {editing ? "Salvar alterações" : "Criar usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
