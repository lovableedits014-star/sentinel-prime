import { useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UserPlus, Eye, EyeOff, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ACCESS_PROFILES, parseRoles, type AccessProfile } from "@/lib/access-control";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

const ROLE_COLORS: Record<string, string> = {
  gestor_social: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  gestor_campanha: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  operacional: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
};

const profileOptions = Object.entries(ACCESS_PROFILES).filter(([key]) => key !== "admin");

export default function TeamUsersPanel({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [selectedRoles, setSelectedRoles] = useState<string[]>(["gestor_social"]);

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ["team-members", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("id, name, email, role, status, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clientId,
  });

  const toggleRole = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) {
      toast.error("Preencha todos os campos");
      return;
    }
    if (form.password.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres");
      return;
    }
    if (selectedRoles.length === 0) {
      toast.error("Selecione ao menos um perfil de acesso");
      return;
    }

    setCreating(true);
    try {
      const role = selectedRoles.join(",");
      const { data, error } = await supabase.functions.invoke("create-team-user", {
        body: { name: form.name, email: form.email, password: form.password, role },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Usuário ${form.name} criado com sucesso!`);
      setForm({ name: "", email: "", password: "" });
      setSelectedRoles(["gestor_social"]);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar usuário");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (member: TeamMember) => {
    const newStatus = member.status === "active" ? "inactive" : "active";
    const { error } = await supabase
      .from("team_members")
      .update({ status: newStatus })
      .eq("id", member.id);

    if (error) {
      toast.error("Erro ao atualizar status");
    } else {
      toast.success(newStatus === "active" ? "Usuário ativado" : "Usuário desativado");
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    }
  };

  const renderRoleBadges = (roleStr: string) => {
    const roles = parseRoles(roleStr);
    return roles.map(role => {
      const profile = ACCESS_PROFILES[role as AccessProfile];
      return (
        <Badge key={role} variant="outline" className={ROLE_COLORS[role] || ""}>
          {profile?.label || role}
        </Badge>
      );
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Equipe & Acessos</CardTitle>
              <CardDescription>Crie usuários com acesso limitado a módulos específicos</CardDescription>
            </div>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus className="w-4 h-4 mr-2" />
                Novo Usuário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Usuário</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    placeholder="Nome completo"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input
                    type="email"
                    placeholder="usuario@email.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Senha</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Mínimo 6 caracteres"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  <Label>Perfis de Acesso</Label>
                  <p className="text-xs text-muted-foreground">Selecione um ou mais perfis. Os acessos serão combinados.</p>
                  <div className="space-y-2">
                    {profileOptions.map(([key, config]) => (
                      <label
                        key={key}
                        className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          selectedRoles.includes(key) ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                        }`}
                      >
                        <Checkbox
                          checked={selectedRoles.includes(key)}
                          onCheckedChange={() => toggleRole(key)}
                          className="mt-0.5"
                        />
                        <div>
                          <p className="text-sm font-medium">{config.label}</p>
                          <p className="text-xs text-muted-foreground">{config.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <Button className="w-full" onClick={handleCreate} disabled={creating}>
                  {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {creating ? "Criando..." : "Criar Usuário"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>Nenhum usuário da equipe criado ainda.</p>
            <p className="text-xs mt-1">Clique em "Novo Usuário" para adicionar membros com acesso limitado.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-3 border rounded-lg p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">
                      {member.name[0]?.toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{member.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {renderRoleBadges(member.role)}
                  <Badge variant={member.status === "active" ? "default" : "secondary"} className="text-[10px]">
                    {member.status === "active" ? "Ativo" : "Inativo"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleToggleStatus(member)}
                    className="text-xs"
                  >
                    {member.status === "active" ? "Desativar" : "Ativar"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
