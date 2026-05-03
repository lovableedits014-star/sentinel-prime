import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Users2, Trophy, TrendingUp, UserPlus, Copy, CheckCircle2,
  Clock, Crown, Medal, Award, Loader2, CalendarCheck, ClipboardList, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import AcoesExternasTab from "@/components/funcionarios/AcoesExternasTab";

export default function Funcionarios() {
  const [copied, setCopied] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; nome: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  const { data: client } = useQuery({
    queryKey: ["my-client"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("clients")
        .select("id, name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!data) {
        const { data: tm } = await supabase
          .from("team_members")
          .select("client_id, clients(id, name)")
          .eq("user_id", user.id)
          .maybeSingle();
        return (tm as any)?.clients || null;
      }
      return data;
    },
  });

  const clientId = client?.id;

  const { data: funcionarios } = useQuery({
    queryKey: ["funcionarios-list", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("funcionarios" as any)
        .select("id, nome, email, cidade, referral_count, status, redes_sociais, created_at")
        .eq("client_id", clientId!)
        .order("referral_count", { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!clientId,
  });

  const { data: stats } = useQuery({
    queryKey: ["funcionarios-stats", clientId],
    queryFn: async () => {
      const { count: totalFunc } = await supabase
        .from("funcionarios" as any)
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId!);

      const { count: totalReferrals } = await supabase
        .from("funcionario_referrals" as any)
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId!);

      const today = new Date().toISOString().split("T")[0];
      const { count: todayCheckins } = await supabase
        .from("funcionario_checkins" as any)
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId!)
        .eq("checkin_date", today);

      return {
        total: totalFunc || 0,
        totalReferrals: totalReferrals || 0,
        todayCheckins: todayCheckins || 0,
        presencaRate: totalFunc ? Math.round(((todayCheckins || 0) / totalFunc) * 100) : 0,
      };
    },
    enabled: !!clientId,
  });

  const { data: recentReferrals } = useQuery({
    queryKey: ["funcionario-recent-referrals", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("funcionario_referrals" as any)
        .select("id, referred_name, referred_phone, created_at, funcionario_id")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false })
        .limit(30);

      if (data && data.length > 0) {
        const funcIds = [...new Set((data as any[]).map((r: any) => r.funcionario_id))];
        const { data: funcs } = await supabase
          .from("funcionarios" as any)
          .select("id, nome")
          .in("id", funcIds);

        const funcMap = new Map((funcs || []).map((f: any) => [f.id, f.nome]));
        return (data as any[]).map((r: any) => ({
          ...r,
          funcionario_nome: funcMap.get(r.funcionario_id) || "Funcionário",
        }));
      }
      return data || [];
    },
    enabled: !!clientId,
  });

  const registerLink = clientId ? `${window.location.origin}/funcionario/${clientId}` : "";

  const handleCopyLink = async () => {
    if (!registerLink) return;
    await navigator.clipboard.writeText(registerLink);
    setCopied(true);
    toast.success("Link de cadastro copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const maxReferrals = funcionarios?.[0]?.referral_count || 1;

  const getRankIcon = (index: number) => {
    if (index === 0) return <Crown className="w-4 h-4 text-amber-500" />;
    if (index === 1) return <Medal className="w-4 h-4 text-gray-400" />;
    if (index === 2) return <Award className="w-4 h-4 text-amber-700" />;
    return null;
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // Remove dependências (referrals e check-ins) antes do funcionário
      await supabase.from("funcionario_referrals" as any).delete().eq("funcionario_id", deleteTarget.id);
      await supabase.from("funcionario_checkins" as any).delete().eq("funcionario_id", deleteTarget.id);
      const { error } = await supabase.from("funcionarios" as any).delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success(`Funcionário "${deleteTarget.nome}" excluído.`);
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["funcionarios-list", clientId] });
      queryClient.invalidateQueries({ queryKey: ["funcionarios-stats", clientId] });
      queryClient.invalidateQueries({ queryKey: ["funcionario-recent-referrals", clientId] });
    } catch (e: any) {
      toast.error("Erro ao excluir: " + (e?.message || "tente novamente"));
    } finally {
      setDeleting(false);
    }
  };

  if (!clientId) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Funcionários</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie sua equipe fixa de campo. Cada funcionário recebe um link exclusivo para cadastrar apoiadores e tem um ranking de indicações. Acompanhe check-ins de presença e organize ações externas de captação.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Users2 className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Funcionários</p>
            </div>
            <p className="text-2xl font-bold">{stats?.total || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <CalendarCheck className="w-3.5 h-3.5 text-emerald-500" />
              <p className="text-xs text-muted-foreground">Presença Hoje</p>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{stats?.todayCheckins || 0}</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{stats?.presencaRate || 0}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <UserPlus className="w-3.5 h-3.5 text-primary" />
              <p className="text-xs text-muted-foreground">Indicações</p>
            </div>
            <p className="text-2xl font-bold text-primary">{stats?.totalReferrals || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Média/Func.</p>
            </div>
            <p className="text-2xl font-bold">
              {stats?.total ? (stats.totalReferrals / stats.total).toFixed(1) : "0"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Registration link */}
      <Card>
        <CardContent className="pt-4 pb-3 px-4">
          <p className="text-sm font-medium mb-2">Link de Cadastro de Funcionários</p>
          <div className="flex gap-2">
            <Input value={registerLink} readOnly className="text-xs font-mono" />
            <Button variant="outline" size="sm" onClick={handleCopyLink}>
              {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="ranking">
        <TabsList>
          <TabsTrigger value="ranking">
            <Trophy className="w-4 h-4 mr-1.5" />Ranking
          </TabsTrigger>
          <TabsTrigger value="timeline">
            <Clock className="w-4 h-4 mr-1.5" />Histórico
          </TabsTrigger>
          <TabsTrigger value="acoes">
            <ClipboardList className="w-4 h-4 mr-1.5" />Ações Externas
          </TabsTrigger>
        </TabsList>

        {/* Ranking Tab */}
        <TabsContent value="ranking" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="w-4 h-4 text-primary" />
                Ranking de Indicações
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!funcionarios || funcionarios.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Users2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">Nenhum funcionário cadastrado</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {funcionarios.map((m: any, i: number) => (
                    <div key={m.id} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        i === 0 ? "bg-primary text-primary-foreground" :
                        i === 1 ? "bg-primary/20 text-primary" :
                        i === 2 ? "bg-primary/10 text-primary" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {getRankIcon(i) || <span>{i + 1}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium truncate">{m.nome}</p>
                          <div className="flex items-center gap-1.5 ml-2 shrink-0">
                            <Badge variant={i < 3 ? "default" : "secondary"} className="text-xs">
                              {m.referral_count} {m.referral_count === 1 ? "indicação" : "indicações"}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteTarget({ id: m.id, nome: m.nome })}
                              aria-label={`Excluir ${m.nome}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                        <Progress value={maxReferrals > 0 ? (m.referral_count / maxReferrals) * 100 : 0} className="h-1.5 mt-1" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Indicações Recentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!recentReferrals || recentReferrals.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhuma indicação registrada</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {(recentReferrals as any[]).map((r: any) => (
                    <div key={r.id} className="flex items-center gap-3 py-3 border-b last:border-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <UserPlus className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-medium">{r.funcionario_nome}</span>
                          <span className="text-muted-foreground mx-1.5">→</span>
                          <span className="font-medium text-primary">{r.referred_name}</span>
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(r.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Ações Externas Tab */}
        <TabsContent value="acoes" className="mt-4">
          <AcoesExternasTab clientId={clientId} />
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir funcionário?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.nome}</strong>? Esta ação remove o funcionário, suas indicações e check-ins. Não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
