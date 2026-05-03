import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Shield, Copy, Trash2, Plus, Loader2, Users, Calendar,
  CheckCircle2, Clock, LogOut, Link2
} from "lucide-react";
import UazapiConfigPanel from "@/components/superadmin/UazapiConfigPanel";
import TseSyncPanel from "@/components/superadmin/TseSyncPanel";

const SUPER_ADMIN_EMAIL = "lovableedits014@gmail.com";

interface InviteToken {
  id: string;
  token: string;
  note: string | null;
  used_by: string | null;
  used_at: string | null;
  expires_at: string;
  created_at: string;
}

interface ClientRow {
  id: string;
  name: string;
  cargo: string | null;
  created_at: string | null;
  user_id: string;
}

export default function SuperAdmin() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [user, setUser] = useState<any>(null);

  const [invites, setInvites] = useState<InviteToken[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [newNote, setNewNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/auth"); return; }
    if (session.user.email !== SUPER_ADMIN_EMAIL) {
      navigate("/dashboard");
      toast.error("Acesso negado");
      return;
    }
    setUser(session.user);
    setAuthorized(true);
    setLoading(false);
    loadData();
  };

  const loadData = async () => {
    const [{ data: inviteData }, { data: clientData }] = await Promise.all([
      supabase.from("invite_tokens" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("clients").select("id, name, cargo, created_at, user_id").order("created_at", { ascending: false }),
    ]);
    setInvites((inviteData as unknown as InviteToken[]) || []);
    setClients((clientData || []) as ClientRow[]);
  };

  const handleCreateInvite = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("invite_tokens" as any)
        .insert({ created_by: user.id, note: newNote.trim() || null } as any)
        .select()
        .single();
      if (error) throw error;
      setInvites((prev) => [data as unknown as InviteToken, ...prev]);
      setNewNote("");
      toast.success("Convite gerado!");
    } catch (err: any) {
      toast.error("Erro ao gerar convite: " + err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteInvite = async (id: string) => {
    setDeleting(id);
    try {
      const { error } = await supabase.from("invite_tokens" as any).delete().eq("id", id);
      if (error) throw error;
      setInvites((prev) => prev.filter((i) => i.id !== id));
      toast.success("Convite removido");
    } catch {
      toast.error("Erro ao remover convite");
    } finally {
      setDeleting(null);
    }
  };

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/signup/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Link de convite copiado!");
  };

  const formatDate = (str: string | null) => {
    if (!str) return "—";
    return new Date(str).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  };

  const isExpired = (str: string) => new Date(str) < new Date();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authorized) return null;

  const activeInvites = invites.filter((i) => !i.used_by && !isExpired(i.expires_at));
  const usedInvites = invites.filter((i) => i.used_by);
  const expiredInvites = invites.filter((i) => !i.used_by && isExpired(i.expires_at));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Super Admin</h1>
              <p className="text-slate-400 text-sm">
                Painel global de gestão da plataforma. Monitore o status de todos os clientes, gerencie acessos, visualize métricas de uso e configure parâmetros globais do sistema.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="border-slate-600 text-slate-300" onClick={() => navigate("/dashboard")}>
              Dashboard
            </Button>
            <Button variant="ghost" size="sm" className="text-slate-400" onClick={() => supabase.auth.signOut().then(() => navigate("/auth"))}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-slate-800/60 border-slate-700">
            <CardContent className="pt-5 pb-4 text-center">
              <p className="text-3xl font-bold text-white">{clients.length}</p>
              <p className="text-slate-400 text-xs mt-1 flex items-center justify-center gap-1"><Users className="w-3 h-3" /> Clientes ativos</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/60 border-slate-700">
            <CardContent className="pt-5 pb-4 text-center">
              <p className="text-3xl font-bold text-emerald-400">{activeInvites.length}</p>
              <p className="text-slate-400 text-xs mt-1 flex items-center justify-center gap-1"><Link2 className="w-3 h-3" /> Convites ativos</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/60 border-slate-700">
            <CardContent className="pt-5 pb-4 text-center">
              <p className="text-3xl font-bold text-slate-300">{usedInvites.length}</p>
              <p className="text-slate-400 text-xs mt-1 flex items-center justify-center gap-1"><CheckCircle2 className="w-3 h-3" /> Convites usados</p>
            </CardContent>
          </Card>
        </div>

        {/* Gerar Convite */}
        <Card className="bg-slate-800/60 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-base">Gerar novo convite</CardTitle>
            <CardDescription className="text-slate-400">
              O link expira em 7 dias e pode ser usado apenas uma vez.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="text-slate-300 text-xs mb-1.5 block">Nota (opcional)</Label>
                <Input
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Ex: Cliente João Silva - campanha 2026"
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                  onKeyDown={(e) => e.key === "Enter" && handleCreateInvite()}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={handleCreateInvite} disabled={creating} className="bg-amber-500 hover:bg-amber-600 text-white">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
                  Gerar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lista de Convites */}
        <Card className="bg-slate-800/60 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-base">Convites</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {invites.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">Nenhum convite gerado ainda.</p>
            ) : (
              invites.map((invite) => {
                const used = !!invite.used_by;
                const expired = !used && isExpired(invite.expires_at);
                return (
                  <div key={invite.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/50 border border-slate-600/50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-xs text-slate-400 font-mono truncate max-w-[180px]">{invite.token.slice(0, 16)}…</code>
                        {used && <Badge className="text-xs bg-slate-600 text-slate-300 border-0">Usado</Badge>}
                        {expired && <Badge className="text-xs bg-red-500/20 text-red-400 border-red-500/30">Expirado</Badge>}
                        {!used && !expired && <Badge className="text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Ativo</Badge>}
                      </div>
                      {invite.note && <p className="text-xs text-slate-300 mt-0.5">{invite.note}</p>}
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {used ? `Usado em ${formatDate(invite.used_at)}` : `Expira em ${formatDate(invite.expires_at)}`}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {!used && !expired && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-white" onClick={() => copyInviteLink(invite.token)}>
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-slate-500 hover:text-red-400"
                        onClick={() => handleDeleteInvite(invite.id)}
                        disabled={deleting === invite.id}
                      >
                        {deleting === invite.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Lista de Clientes */}
        <Card className="bg-slate-800/60 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-base">Clientes cadastrados</CardTitle>
            <CardDescription className="text-slate-400">Todos os admins que criaram conta na plataforma</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {clients.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">Nenhum cliente ainda.</p>
            ) : (
              clients.map((client) => (
                <div key={client.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/50 border border-slate-600/50">
                  <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center shrink-0">
                    <span className="text-primary text-sm font-bold">{client.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{client.name}</p>
                    {client.cargo && <p className="text-slate-400 text-xs">{client.cargo}</p>}
                    <p className="text-slate-500 text-xs flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3" /> Desde {formatDate(client.created_at)}
                    </p>
                  </div>
                  <code className="text-slate-600 text-xs font-mono hidden sm:block">{client.id.slice(0, 8)}…</code>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* UAZAPI Configuration */}
        <UazapiConfigPanel />

        {/* Sincronização TSE */}
        <TseSyncPanel />
      </div>
    </div>
  );
}
