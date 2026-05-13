import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, Users, Loader2, Trash2, Pencil, Eye, EyeOff, KeyRound, Power } from "lucide-react";
import { ALL_APP_TABS, ALWAYS_ALLOWED_PATHS, SECTION_ORDER, tabsBySection } from "@/lib/access-control";

interface PlatformUser {
  id: string;
  user_id: string;
  name: string;
  email: string;
  allowed_paths: string[];
  status: string;
  created_at: string;
}

const TOTAL_TABS = ALL_APP_TABS.length;

export default function PlatformUsersPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformUser | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPwd, setShowPwd] = useState(false);
  const [paths, setPaths] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["platform-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_users" as any)
        .select("id, user_id, name, email, allowed_paths, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PlatformUser[];
    },
  });

  const reset = () => {
    setEditing(null);
    setForm({ name: "", email: "", password: "" });
    setPaths([]);
    setShowPwd(false);
  };

  const openCreate = () => {
    reset();
    setOpen(true);
  };

  const openEdit = (u: PlatformUser) => {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: "" });
    setPaths(u.allowed_paths || []);
    setOpen(true);
  };

  const togglePath = (p: string) => {
    setPaths((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };
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
    if (!editing && !form.password) return toast.error("Senha é obrigatória");
    if (form.password && form.password.length < 6) return toast.error("Senha mínima de 6 caracteres");

    setSaving(true);
    try {
      const body: any = editing
        ? { action: "update", id: editing.id, name: form.name, allowed_paths: paths, password: form.password || undefined }
        : { action: "create", name: form.name, email: form.email, password: form.password, allowed_paths: paths };

      const { data, error } = await supabase.functions.invoke("manage-platform-user", { body });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast.success(editing ? "Acessos atualizados" : "Usuário criado");
      setOpen(false);
      reset();
      qc.invalidateQueries({ queryKey: ["platform-users"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (u: PlatformUser) => {
    const next = u.status === "active" ? "disabled" : "active";
    try {
      const { error } = await supabase.functions.invoke("manage-platform-user", {
        body: { action: "update", id: u.id, status: next },
      });
      if (error) throw error;
      toast.success(next === "active" ? "Usuário reativado" : "Usuário desativado");
      qc.invalidateQueries({ queryKey: ["platform-users"] });
    } catch (err: any) {
      toast.error(err.message || "Erro");
    }
  };

  const handleDelete = async (u: PlatformUser) => {
    if (!confirm(`Excluir ${u.name}? Esta ação não pode ser desfeita.`)) return;
    try {
      const { error } = await supabase.functions.invoke("manage-platform-user", {
        body: { action: "delete", id: u.id },
      });
      if (error) throw error;
      toast.success("Usuário removido");
      qc.invalidateQueries({ queryKey: ["platform-users"] });
    } catch (err: any) {
      toast.error(err.message || "Erro");
    }
  };

  const grouped = tabsBySection();

  return (
    <Card className="bg-slate-800/60 border-slate-700">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Users className="w-4 h-4" /> Usuários da plataforma
          </CardTitle>
          <CardDescription className="text-slate-400">
            Cadastre usuários e libere/bloqueie cada aba do sistema individualmente.
          </CardDescription>
        </div>
        <Button onClick={openCreate} className="bg-amber-500 hover:bg-amber-600 text-white shrink-0">
          <UserPlus className="w-4 h-4 mr-1" /> Novo usuário
        </Button>
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
                    {u.status === "disabled" && (
                      <Badge className="text-[10px] bg-red-500/20 text-red-400 border-red-500/30">Desativado</Badge>
                    )}
                  </div>
                  <p className="text-slate-400 text-xs truncate">{u.email}</p>
                  <p
                    className="text-slate-500 text-[11px] mt-0.5"
                    title={(u.allowed_paths || []).join(", ")}
                  >
                    {count} de {TOTAL_TABS} abas liberadas
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-300 hover:text-white" onClick={() => openEdit(u)} title="Editar acessos">
                    <Pencil className="w-3.5 h-3.5" />
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
            <DialogTitle>{editing ? "Editar usuário" : "Novo usuário da plataforma"}</DialogTitle>
            <DialogDescription>
              {editing ? "Marque ou desmarque cada aba individualmente para esse usuário." : "Defina email, senha e marque cada aba que esse usuário poderá acessar."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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
                        <div className="flex gap-1">
                          <Button type="button" size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={() => toggleSection(section, !allOn)}>
                            {allOn ? "Limpar seção" : "Liberar seção"}
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                        {items.map((tab) => {
                          const checked = paths.includes(tab.path);
                          return (
                            <label
                              key={tab.path}
                              className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                            >
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
