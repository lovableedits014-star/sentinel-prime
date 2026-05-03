import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users2, LogOut, CheckCircle2, Loader2, ExternalLink, Facebook,
  Instagram, CalendarCheck, UserPlus, Eye, EyeOff, Target, Users,
  Plus, Copy, Crown, Trophy, ClipboardList, MapPin,
} from "lucide-react";
import { toast } from "sonner";
import CampaignFrameGenerator from "@/components/campaign-frame/CampaignFrameGenerator";
import WhatsAppGate from "@/components/portal/WhatsAppGate";
import SocialNetworksEditor from "@/components/portal/SocialNetworksEditor";
import InstallAppFab from "@/components/portal/InstallAppFab";
import { rememberPortalClientId } from "@/lib/pwa-client";

interface Mission {
  id: string;
  platform: string;
  post_url: string;
  title: string | null;
  description: string | null;
}

interface FuncionarioInfo {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  cidade: string | null;
  client_id: string;
  referral_code: string;
  referral_count: number;
  redes_sociais: any[];
  whatsapp_confirmado?: boolean;
  supporter_id?: string | null;
}

interface Referral {
  id: string;
  referred_name: string;
  referred_phone: string | null;
  created_at: string;
}

export default function PortalFuncionario() {
  const { clientId } = useParams<{ clientId: string }>();

  // Persiste o clientId para que o PWA instalado abra direto neste portal
  // (especialmente no iOS, onde o standalone tem localStorage isolado).
  useEffect(() => {
    rememberPortalClientId(clientId);
  }, [clientId]);

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [funcionario, setFuncionario] = useState<FuncionarioInfo | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientLogo, setClientLogo] = useState<string | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [totalCheckins, setTotalCheckins] = useState(0);
  const [streak, setStreak] = useState(0);

  const [showAddForm, setShowAddForm] = useState(false);
  const [indNome, setIndNome] = useState("");
  const [indTelefone, setIndTelefone] = useState("");
  const [addingIndicado, setAddingIndicado] = useState(false);

  // Ações Externas state
  const [acoes, setAcoes] = useState<any[]>([]);
  const [acaoAssignments, setAcaoAssignments] = useState<any[]>([]);
  const [collectingAcaoId, setCollectingAcaoId] = useState<string | null>(null);
  const [acaoCadNome, setAcaoCadNome] = useState("");
  const [acaoCadTelefone, setAcaoCadTelefone] = useState("");
  const [acaoCadCidade, setAcaoCadCidade] = useState("");
  const [acaoCadBairro, setAcaoCadBairro] = useState("");
  const [submittingCadastro, setSubmittingCadastro] = useState(false);

  useEffect(() => {
    if (clientId) {
      supabase.from("clients").select("name, logo_url").eq("id", clientId).maybeSingle()
        .then(({ data }) => { if (data) { setClientName(data.name); setClientLogo(data.logo_url); } });
    }
  }, [clientId]);

  useEffect(() => {
    supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setLoading(false); });
    supabase.auth.getSession().then(({ data: { session: s } }) => { setSession(s); setLoading(false); });
  }, []);

  useEffect(() => {
    if (session && clientId) loadPortalData();
  }, [session, clientId]);

  const loadPortalData = async () => {
    if (!session || !clientId) return;

    const { data: func } = await supabase
      .from("funcionarios" as any)
      .select("id, nome, telefone, email, cidade, client_id, referral_code, referral_count, redes_sociais, whatsapp_confirmado, supporter_id")
      .eq("client_id", clientId)
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!func) {
      toast.error("Conta de funcionário não encontrada.");
      return;
    }
    setFuncionario(func as any);

    const [missRes, refRes] = await Promise.all([
      supabase.from("portal_missions").select("id, platform, post_url, title, description")
        .eq("client_id", clientId).eq("is_active", true).order("display_order"),
      supabase.from("funcionario_referrals" as any).select("id, referred_name, referred_phone, created_at")
        .eq("funcionario_id", (func as any).id).order("created_at", { ascending: false }),
    ]);

    setMissions((missRes.data || []) as any);
    setReferrals((refRes.data || []) as any);

    // Check today's checkin
    const today = new Date().toISOString().split("T")[0];
    const { data: checkin } = await supabase
      .from("funcionario_checkins" as any)
      .select("id")
      .eq("funcionario_id", (func as any).id)
      .eq("checkin_date", today)
      .maybeSingle();
    setCheckedInToday(!!checkin);

    // Load checkin stats
    const { data: allCheckins } = await supabase
      .from("funcionario_checkins" as any)
      .select("checkin_date")
      .eq("funcionario_id", (func as any).id)
      .order("checkin_date", { ascending: false })
      .limit(90);

    if (allCheckins) {
      setTotalCheckins(allCheckins.length);
      let s = 0;
      const td = new Date();
      for (let i = 0; i < allCheckins.length; i++) {
        const exp = new Date(td); exp.setDate(exp.getDate() - i);
        if ((allCheckins[i] as any).checkin_date === exp.toISOString().split("T")[0]) s++; else break;
      }
      setStreak(s);
    }

    // Load assigned ações externas
    const { data: assignData } = await supabase
      .from("acao_externa_funcionarios" as any)
      .select("id, acao_id, funcionario_id, cadastros_coletados")
      .eq("funcionario_id", (func as any).id);
    setAcaoAssignments((assignData || []) as any);

    if (assignData && assignData.length > 0) {
      const acaoIds = (assignData as any[]).map((a: any) => a.acao_id);
      const { data: acoesData } = await supabase
        .from("acoes_externas" as any)
        .select("*")
        .in("id", acaoIds)
        .in("status", ["ativa", "planejada"]);
      setAcoes((acoesData || []) as any);
    } else {
      setAcoes([]);
    }
  };

  const handleCheckin = async () => {
    if (!funcionario || checkedInToday) return;
    setCheckingIn(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const { error } = await supabase.from("funcionario_checkins" as any).insert({
        funcionario_id: funcionario.id,
        client_id: clientId!,
        checkin_date: today,
      });
      if (error && error.code === "23505") { setCheckedInToday(true); return; }
      if (error) throw error;
      setCheckedInToday(true);
      setStreak(s => s + 1);
      setTotalCheckins(t => t + 1);
      toast.success("✅ Presença marcada!");
    } catch { toast.error("Erro ao marcar presença"); }
    finally { setCheckingIn(false); }
  };

  const handleAddIndicado = async () => {
    if (!funcionario || !indNome.trim() || !indTelefone.trim()) {
      toast.error("Nome e telefone são obrigatórios."); return;
    }
    setAddingIndicado(true);

    // Insert into funcionario_referrals
    const { error } = await supabase.from("funcionario_referrals" as any).insert({
      funcionario_id: funcionario.id,
      client_id: clientId!,
      referred_name: indNome.trim(),
      referred_phone: indTelefone.trim(),
    });

    if (error) { toast.error("Erro ao adicionar indicado."); }
    else {
      // Increment referral_count
      await supabase.from("funcionarios" as any)
        .update({ referral_count: (funcionario.referral_count || 0) + 1 })
        .eq("id", funcionario.id);

      toast.success("Indicado adicionado! 🎉");
      setIndNome(""); setIndTelefone("");
      setShowAddForm(false);
      loadPortalData();
    }
    setAddingIndicado(false);
  };

  const handleAcaoCadastro = async () => {
    if (!funcionario || !collectingAcaoId || !acaoCadNome.trim() || !acaoCadTelefone.trim()) {
      toast.error("Nome e telefone são obrigatórios."); return;
    }
    setSubmittingCadastro(true);
    try {
      const acao = acoes.find((a: any) => a.id === collectingAcaoId);
      if (!acao) throw new Error("Ação não encontrada");

      const { data: pessoaId, error } = await supabase.rpc("register_pessoa_public", {
        p_client_id: clientId!,
        p_nome: acaoCadNome.trim(),
        p_telefone: acaoCadTelefone.trim(),
        p_cidade: acaoCadCidade.trim() || null,
        p_bairro: acaoCadBairro.trim() || null,
        p_tipo_pessoa: "cidadao",
        p_notas: `Coletado na ação: ${acao.titulo}`,
      });
      if (error) throw error;

      // Tag the pessoa with the ação's tag
      if (pessoaId) {
        await supabase.rpc("tag_pessoa_acao_externa" as any, {
          p_client_id: clientId!,
          p_pessoa_id: pessoaId,
          p_tag_nome: acao.tag_nome,
          p_tag_descricao: `Ação externa: ${acao.titulo}`,
        });
      }

      const assignment = acaoAssignments.find((a: any) => a.acao_id === collectingAcaoId);
      if (assignment) {
        await supabase.from("acao_externa_funcionarios" as any)
          .update({ cadastros_coletados: (assignment.cadastros_coletados || 0) + 1 })
          .eq("id", assignment.id);
      }

      await supabase.from("acoes_externas" as any)
        .update({ cadastros_coletados: (acao.cadastros_coletados || 0) + 1 })
        .eq("id", acao.id);

      toast.success("Cadastro registrado! ✅");
      setAcaoCadNome(""); setAcaoCadTelefone(""); setAcaoCadCidade(""); setAcaoCadBairro("");
      loadPortalData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar cadastro");
    }
    setSubmittingCadastro(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err: any) { toast.error(err.message || "Erro ao entrar"); }
    finally { setAuthLoading(false); }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setFuncionario(null);
  };

  const getPlatformIcon = (p: string) => {
    if (p === "instagram") return <Instagram className="w-5 h-5 text-pink-500" />;
    if (p === "facebook") return <Facebook className="w-5 h-5 text-blue-600" />;
    return <ExternalLink className="w-5 h-5" />;
  };

  const referralLink = funcionario
    ? `${window.location.origin}/cadastro/${clientId}?ref_func=${funcionario.referral_code}`
    : "";

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/5 to-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  // ─── AUTH SCREEN ─────────────────────────────────────────────────────
  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-lg overflow-hidden bg-primary">
              {clientLogo ? <img src={clientLogo} alt="Logo" className="w-full h-full object-cover" /> : <Users2 className="w-8 h-8 text-primary-foreground" />}
            </div>
            {clientName && <h1 className="text-2xl font-bold">{clientName}</h1>}
            <p className="text-sm text-muted-foreground font-medium">Portal do Funcionário</p>
          </div>
          <Card className="shadow-xl">
            <CardContent className="pt-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={authLoading}>
                  {authLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Entrar
                </Button>
                <p className="text-xs text-center text-muted-foreground">Use o e-mail e senha que você definiu no cadastro.</p>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!funcionario) {
    return <div className="min-h-screen flex items-center justify-center p-4"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  // ─── PORTAL ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      {/* WhatsApp anti-ban gate — required on first access */}
      {funcionario && clientId && !funcionario.whatsapp_confirmado && (
        <WhatsAppGate
          clientId={clientId}
          clientName={clientName}
          clientLogo={clientLogo}
          role="funcionario"
          userName={funcionario.nome}
          onConfirmed={async () => {
            await supabase
              .from("funcionarios" as any)
              .update({ whatsapp_confirmado: true })
              .eq("id", funcionario.id);
            setFuncionario({ ...funcionario, whatsapp_confirmado: true });
          }}
          checkConfirmed={async () => {
            const { data } = await supabase
              .from("funcionarios" as any)
              .select("whatsapp_confirmado")
              .eq("id", funcionario.id)
              .maybeSingle();
            return Boolean((data as any)?.whatsapp_confirmado);
          }}
        />
      )}
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center overflow-hidden">
            {clientLogo ? <img src={clientLogo} alt="" className="w-full h-full object-cover" /> : <Users2 className="w-5 h-5 text-primary-foreground" />}
          </div>
          <div>
            <p className="font-semibold text-sm">{funcionario.nome}</p>
            <p className="text-xs text-muted-foreground">Funcionário — {clientName}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={handleLogout}><LogOut className="w-4 h-4" /></Button>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">

        {/* Gerador de foto de campanha */}
        {clientId && <CampaignFrameGenerator clientId={clientId} variant="showcase" />}

        {/* ── CHECK-IN ────────────────────────── */}
        <Card className="overflow-hidden">
          <div className={`p-4 text-center ${checkedInToday ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-primary/5"}`}>
            <div className="flex items-center justify-center gap-3 mb-3">
              <div className="text-center">
                <p className="text-3xl font-bold">{streak}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">dias seguidos</p>
              </div>
              <div className="w-px h-10 bg-border" />
              <div className="text-center">
                <p className="text-3xl font-bold">{totalCheckins}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">total</p>
              </div>
            </div>
            <Button onClick={handleCheckin} disabled={checkedInToday || checkingIn} className="w-full gap-2" size="lg">
              {checkingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : checkedInToday ? <CheckCircle2 className="w-5 h-5" /> : <CalendarCheck className="w-5 h-5" />}
              {checkedInToday ? "Presença Marcada ✅" : "Marcar Presença"}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              {checkedInToday ? "Ótimo! Agora cumpra suas missões abaixo 👇" : "⚠️ Marque sua presença diariamente — é obrigatório!"}
            </p>
          </div>
        </Card>

        {/* ── REFERRAL LINK ────────────────────────── */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-primary" />
              <p className="text-sm font-semibold">Seu Link de Indicação</p>
              <Badge variant="secondary" className="ml-auto text-xs gap-1">
                <Trophy className="w-3 h-3" />{funcionario.referral_count} indicações
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Compartilhe este link para convidar pessoas a se cadastrarem como apoiadores. Cada indicação soma pontos no seu ranking!
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-background rounded-lg border px-3 py-2 text-xs truncate font-mono">
                {referralLink}
              </div>
              <Button
                size="sm" variant="outline" className="shrink-0 gap-1.5"
                onClick={() => { navigator.clipboard.writeText(referralLink); toast.success("Link copiado!"); }}
              >
                <Copy className="w-3.5 h-3.5" />Copiar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── TABS ────────────────────────── */}
        <Tabs defaultValue="missoes">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="missoes" className="gap-1.5 text-xs"><Target className="w-3.5 h-3.5" />Missões</TabsTrigger>
            <TabsTrigger value="indicados" className="gap-1.5 text-xs">
              <Users className="w-3.5 h-3.5" />Indicados
            </TabsTrigger>
            <TabsTrigger value="acoes" className="gap-1.5 text-xs">
              <ClipboardList className="w-3.5 h-3.5" />Ações
              {acoes.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">{acoes.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="missoes" className="space-y-3 mt-3">
            <p className="text-xs text-muted-foreground">
              ⚠️ <strong>Obrigatório:</strong> Interaja em todas as postagens abaixo diariamente. As missões são atualizadas pela equipe.
            </p>
            {missions.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhuma missão ativa no momento.</CardContent></Card>
            ) : (
              missions.map(m => (
                <Card key={m.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {getPlatformIcon(m.platform)}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{m.title || `Missão ${m.platform}`}</p>
                        {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
                      </div>
                      <Button asChild size="sm" className="shrink-0 gap-1">
                        <a href={m.post_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3.5 h-3.5" />Interagir
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="indicados" className="space-y-3 mt-3">
            <p className="text-xs text-muted-foreground">
              Indique pessoas para se cadastrarem como apoiadores. Cada indicação melhora seu ranking de influenciador!
            </p>

            {!showAddForm ? (
              <Button onClick={() => setShowAddForm(true)} className="w-full gap-2" variant="outline">
                <Plus className="w-4 h-4" />Indicar Pessoa
              </Button>
            ) : (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <p className="text-sm font-semibold">Nova indicação</p>
                  <div className="space-y-2">
                    <Input value={indNome} onChange={e => setIndNome(e.target.value)} placeholder="Nome completo *" />
                    <Input value={indTelefone} onChange={e => setIndTelefone(e.target.value)} placeholder="Telefone *" />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setShowAddForm(false)} className="flex-1">Cancelar</Button>
                    <Button onClick={handleAddIndicado} disabled={addingIndicado} className="flex-1 gap-1">
                      {addingIndicado ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}Adicionar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {referrals.map(ref => (
              <div key={ref.id} className="flex items-center justify-between p-3 rounded-xl border bg-card">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{ref.referred_name}</p>
                  <p className="text-xs text-muted-foreground">
                    📞 {ref.referred_phone || "—"} • {new Date(ref.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>
            ))}
            {referrals.length === 0 && !showAddForm && (
              <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhuma indicação ainda. Comece indicando!</CardContent></Card>
            )}
          </TabsContent>

          {/* ── AÇÕES EXTERNAS TAB ────────────────────────── */}
          <TabsContent value="acoes" className="space-y-3 mt-3">
            <p className="text-xs text-muted-foreground">
              Ações externas em que você foi escalado. Colete cadastros diretamente pelo celular.
            </p>
            {acoes.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhuma ação atribuída no momento.</CardContent></Card>
            ) : (
              acoes.map((acao: any) => {
                const assignment = acaoAssignments.find((a: any) => a.acao_id === acao.id);
                const totalAssigned = acaoAssignments.filter((a: any) => a.acao_id === acao.id).length || 1;
                const metaIndividual = Math.ceil(acao.meta_cadastros / totalAssigned);
                const meusCadastros = assignment?.cadastros_coletados || 0;
                const isCollecting = collectingAcaoId === acao.id;

                return (
                  <Card key={acao.id} className="overflow-hidden">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm">{acao.titulo}</p>
                          {acao.local && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{acao.local}</p>}
                        </div>
                        <Badge variant={acao.status === "ativa" ? "default" : "secondary"}>
                          {acao.status === "ativa" ? "Ativa" : "Planejada"}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-muted/50 rounded-lg p-2">
                          <p className="text-lg font-bold">{meusCadastros}</p>
                          <p className="text-[10px] text-muted-foreground">Meus cadastros</p>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-2">
                          <p className="text-lg font-bold">~{metaIndividual}</p>
                          <p className="text-[10px] text-muted-foreground">Minha meta</p>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-2">
                          <p className="text-lg font-bold">{acao.cadastros_coletados}/{acao.meta_cadastros}</p>
                          <p className="text-[10px] text-muted-foreground">Total equipe</p>
                        </div>
                      </div>

                      {acao.status === "ativa" && (
                        <>
                          {!isCollecting ? (
                            <Button onClick={() => setCollectingAcaoId(acao.id)} className="w-full gap-1.5" size="sm">
                              <Plus className="w-4 h-4" />Coletar Cadastro
                            </Button>
                          ) : (
                            <div className="space-y-2 border-t pt-3">
                              <p className="text-xs font-semibold">Novo cadastro:</p>
                              <Input value={acaoCadNome} onChange={e => setAcaoCadNome(e.target.value)} placeholder="Nome completo *" />
                              <Input value={acaoCadTelefone} onChange={e => setAcaoCadTelefone(e.target.value)} placeholder="Telefone *" />
                              <div className="grid grid-cols-2 gap-2">
                                <Input value={acaoCadCidade} onChange={e => setAcaoCadCidade(e.target.value)} placeholder="Cidade" />
                                <Input value={acaoCadBairro} onChange={e => setAcaoCadBairro(e.target.value)} placeholder="Bairro" />
                              </div>
                              <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => setCollectingAcaoId(null)} className="flex-1">Cancelar</Button>
                                <Button size="sm" onClick={handleAcaoCadastro} disabled={submittingCadastro} className="flex-1 gap-1">
                                  {submittingCadastro ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Salvar
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>
        </Tabs>

        {/* ── Social networks status ────────────────────────── */}
        <SocialNetworksEditor
          table="funcionarios"
          recordId={funcionario.id}
          clientId={funcionario.client_id}
          supporterId={funcionario.supporter_id || null}
          initial={funcionario.redes_sociais || []}
          onChange={(next) => setFuncionario({ ...funcionario, redes_sociais: next })}
        />
      </div>
      <InstallAppFab />
    </div>
  );
}
