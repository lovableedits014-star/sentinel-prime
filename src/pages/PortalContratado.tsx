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
  Briefcase, LogOut, CheckCircle2, Loader2, ExternalLink, Facebook,
  Instagram, CalendarCheck, UserPlus, Eye, EyeOff, Target, Users,
  Plus, Award, MessageCircle, Copy, Crown, AlertTriangle, Lock,
} from "lucide-react";
import { toast } from "sonner";
import CampaignFrameGenerator from "@/components/campaign-frame/CampaignFrameGenerator";
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

interface Indicado {
  id: string;
  nome: string;
  telefone: string;
  endereco: string | null;
  cidade: string | null;
  bairro: string | null;
  status: string;
  created_at: string;
}

interface ContratadoInfo {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  cidade: string | null;
  zona_eleitoral: string | null;
  quota_indicados: number;
  client_id: string;
  contrato_aceito: boolean;
  whatsapp_confirmado: boolean;
  is_lider: boolean;
  redes_sociais?: any[];
}

interface Liderado {
  id: string;
  nome: string;
  telefone: string;
  status: string;
  checkedInToday: boolean;
  lastCheckin: string | null;
}

export default function PortalContratado() {
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

  const [contratado, setContratado] = useState<ContratadoInfo | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientLogo, setClientLogo] = useState<string | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [indicados, setIndicados] = useState<Indicado[]>([]);
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [totalCheckins, setTotalCheckins] = useState(0);
  const [streak, setStreak] = useState(0);
  const [liderados, setLiderados] = useState<Liderado[]>([]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [indNome, setIndNome] = useState("");
  const [indTelefone, setIndTelefone] = useState("");
  const [indEndereco, setIndEndereco] = useState("");
  const [indCidade, setIndCidade] = useState("");
  const [indBairro, setIndBairro] = useState("");
  const [addingIndicado, setAddingIndicado] = useState(false);

  const [whatsappOficial, setWhatsappOficial] = useState("");

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

    // Fetch whatsapp_oficial with authenticated session
    const { data: clientData } = await supabase.from("clients").select("whatsapp_oficial").eq("id", clientId).maybeSingle();
    if (clientData?.whatsapp_oficial) setWhatsappOficial(clientData.whatsapp_oficial);

    const { data: cont } = await supabase
      .from("contratados")
      .select("id, nome, telefone, email, cidade, zona_eleitoral, quota_indicados, client_id, contrato_aceito, whatsapp_confirmado, is_lider, redes_sociais")
      .eq("client_id", clientId)
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!cont) {
      toast.error("Conta de contratado não encontrada.");
      return;
    }
    setContratado(cont as any);

    const [missRes, indRes] = await Promise.all([
      supabase.from("portal_missions").select("id, platform, post_url, title, description")
        .eq("client_id", clientId).eq("is_active", true).order("display_order"),
      supabase.from("contratado_indicados").select("*")
        .eq("contratado_id", (cont as any).id).order("created_at", { ascending: false }),
    ]);

    setMissions((missRes.data || []) as any);
    setIndicados((indRes.data || []) as any);

    // Check today's checkin
    const today = new Date().toISOString().split("T")[0];
    const { data: checkin } = await supabase
      .from("contratado_checkins")
      .select("id")
      .eq("contratado_id", (cont as any).id)
      .eq("checkin_date", today)
      .maybeSingle();
    setCheckedInToday(!!checkin);

    // Load checkin stats
    const { data: allCheckins } = await supabase
      .from("contratado_checkins")
      .select("checkin_date")
      .eq("contratado_id", (cont as any).id)
      .order("checkin_date", { ascending: false })
      .limit(90);

    if (allCheckins) {
      setTotalCheckins(allCheckins.length);
      let s = 0;
      const td = new Date();
      for (let i = 0; i < allCheckins.length; i++) {
        const exp = new Date(td); exp.setDate(exp.getDate() - i);
        if (allCheckins[i].checkin_date === exp.toISOString().split("T")[0]) s++; else break;
      }
      setStreak(s);
    }

    // Load liderados if leader
    if ((cont as any).is_lider) {
      await loadLiderados((cont as any).id, today);
    }
  };

  const loadLiderados = async (liderId: string, today: string) => {
    const { data: subs } = await supabase
      .from("contratados")
      .select("id, nome, telefone, status")
      .eq("lider_id", liderId)
      .order("nome");

    if (!subs || subs.length === 0) { setLiderados([]); return; }

    // Get today's checkins for all liderados
    const subIds = subs.map(s => s.id);
    const { data: todayCheckins } = await supabase
      .from("contratado_checkins")
      .select("contratado_id, checkin_date")
      .in("contratado_id", subIds)
      .eq("checkin_date", today);

    // Get last checkin for each
    const { data: lastCheckins } = await supabase
      .from("contratado_checkins")
      .select("contratado_id, checkin_date")
      .in("contratado_id", subIds)
      .order("checkin_date", { ascending: false })
      .limit(500);

    const todaySet = new Set((todayCheckins || []).map(c => c.contratado_id));
    const lastMap = new Map<string, string>();
    (lastCheckins || []).forEach(c => {
      if (!lastMap.has(c.contratado_id)) lastMap.set(c.contratado_id, c.checkin_date);
    });

    setLiderados(subs.map(s => ({
      ...s,
      checkedInToday: todaySet.has(s.id),
      lastCheckin: lastMap.get(s.id) || null,
    })));
  };

  const handleCheckin = async () => {
    if (!contratado || checkedInToday) return;
    setCheckingIn(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const { error } = await supabase.from("contratado_checkins").insert({
        contratado_id: contratado.id,
        client_id: clientId!,
        checkin_date: today,
      } as any);
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
    if (!contratado || !indNome.trim() || !indTelefone.trim()) {
      toast.error("Nome e telefone são obrigatórios."); return;
    }
    setAddingIndicado(true);
    const { error } = await supabase.from("contratado_indicados").insert({
      contratado_id: contratado.id,
      client_id: clientId!,
      nome: indNome.trim(),
      telefone: indTelefone.trim(),
      endereco: indEndereco.trim() || null,
      cidade: indCidade.trim() || null,
      bairro: indBairro.trim() || null,
    } as any);
    if (error) { toast.error("Erro ao adicionar indicado."); }
    else {
      toast.success("Indicado adicionado!");
      setIndNome(""); setIndTelefone(""); setIndEndereco(""); setIndCidade(""); setIndBairro("");
      setShowAddForm(false);
      loadPortalData();
    }
    setAddingIndicado(false);
  };

  const handleSendWhatsApp = async () => {
    if (!contratado) return;

    try {
      const { data, error } = await supabase.functions.invoke("resolve-whatsapp-link", {
        body: { client_id: contratado.client_id },
      });

      if (error) {
        toast.error(error.message || "Erro ao buscar WhatsApp oficial");
        return;
      }

      const waUrl = data?.wa_url as string | undefined;
      if (!waUrl) {
        toast.error("WhatsApp Oficial não encontrado para esta conta.");
        return;
      }

      const msg = `Olá! Sou ${contratado.nome}, confirmando meu cadastro como contratado.`;
      window.open(`${waUrl}?text=${encodeURIComponent(msg)}`, "_blank");

      setContratado({ ...contratado, whatsapp_confirmado: true });
      toast.success("WhatsApp confirmado!");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao enviar WhatsApp");
    }
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
    setContratado(null);
  };

  const getPlatformIcon = (p: string) => {
    if (p === "instagram") return <Instagram className="w-5 h-5 text-pink-500" />;
    if (p === "facebook") return <Facebook className="w-5 h-5 text-blue-600" />;
    return <ExternalLink className="w-5 h-5" />;
  };

  const quotaProgress = contratado ? Math.round((indicados.length / Math.max(contratado.quota_indicados, 1)) * 100) : 0;
  const quotaComplete = contratado ? indicados.length >= contratado.quota_indicados : false;

  // Access control: portal is only unlocked when WhatsApp confirmed AND contract signed
  const portalUnlocked = contratado ? contratado.whatsapp_confirmado && contratado.contrato_aceito : false;

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
              {clientLogo ? <img src={clientLogo} alt="Logo" className="w-full h-full object-cover" /> : <Briefcase className="w-8 h-8 text-primary-foreground" />}
            </div>
            {clientName && <h1 className="text-2xl font-bold">{clientName}</h1>}
            <p className="text-sm text-muted-foreground font-medium">Portal do Contratado</p>
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

  if (!contratado) {
    return <div className="min-h-screen flex items-center justify-center p-4"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  // ─── PORTAL ──────────────────────────────────────────────────────────
  const missingWhatsapp = !contratado.whatsapp_confirmado;
  const missingContract = !contratado.contrato_aceito;
  const lideradosSemPresenca = liderados.filter(l => !l.checkedInToday);

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center overflow-hidden">
            {clientLogo ? <img src={clientLogo} alt="" className="w-full h-full object-cover" /> : <Briefcase className="w-5 h-5 text-primary-foreground" />}
          </div>
          <div>
            <p className="font-semibold text-sm">{contratado.nome}</p>
            <p className="text-xs text-muted-foreground">
              {contratado.is_lider ? "👑 Líder" : "Contratado"} — {clientName}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={handleLogout}><LogOut className="w-4 h-4" /></Button>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">

        {/* Gerador de foto de campanha (visível mesmo antes do gate, é independente) */}
        {clientId && portalUnlocked && <CampaignFrameGenerator clientId={clientId} variant="showcase" />}

        {/* ── GATE: WhatsApp + Contract ────────────────────────── */}
        {!portalUnlocked && (
          <Card className="border-amber-400 bg-amber-50 dark:bg-amber-950/30">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-amber-900 dark:text-amber-200">Acesso pendente</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Complete os passos abaixo para liberar o portal.
                  </p>
                </div>
              </div>

              {/* Step 1: WhatsApp */}
              <div className={`flex items-start gap-3 p-3 rounded-lg border ${missingWhatsapp ? "border-amber-300 bg-background" : "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20"}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${missingWhatsapp ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"}`}>
                  {missingWhatsapp ? "1" : <CheckCircle2 className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Enviar WhatsApp de confirmação</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Clique no botão abaixo para enviar a mensagem de confirmação via WhatsApp.
                  </p>
                  {missingWhatsapp && (
                    <>
                      <Button onClick={handleSendWhatsApp} size="sm" className="mt-2 gap-1.5">
                        <MessageCircle className="w-4 h-4" />Enviar WhatsApp
                      </Button>
                      {!whatsappOficial && (
                        <p className="text-xs text-destructive mt-1 font-medium">
                          ⚠️ Se aparecer erro, peça ao coordenador para revisar o WhatsApp Oficial nas configurações.
                        </p>
                      )}
                    </>
                  )}
                  {!missingWhatsapp && (
                    <p className="text-xs text-emerald-600 mt-1 font-medium">✅ WhatsApp confirmado</p>
                  )}
                </div>
              </div>

              {/* Step 2: Contract */}
              <div className={`flex items-start gap-3 p-3 rounded-lg border ${missingContract ? "border-amber-300 bg-background" : "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20"}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${missingContract ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"}`}>
                  {missingContract ? "2" : <CheckCircle2 className="w-4 h-4" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Assinatura do contrato</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {missingContract
                      ? "Aguardando o administrador confirmar a assinatura do seu contrato. Entre em contato com seu coordenador."
                      : "✅ Contrato assinado"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── CHECK-IN (always visible) ────────────────────────── */}
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
            <Button onClick={handleCheckin} disabled={checkedInToday || checkingIn || !portalUnlocked} className="w-full gap-2" size="lg">
              {checkingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : checkedInToday ? <CheckCircle2 className="w-5 h-5" /> : <CalendarCheck className="w-5 h-5" />}
              {checkedInToday ? "Presença Marcada ✅" : "Marcar Presença"}
            </Button>
            {!portalUnlocked && (
              <p className="text-xs text-amber-600 mt-2">🔒 Complete os passos acima para habilitar</p>
            )}
          </div>
        </Card>

        {/* WhatsApp confirmed badge */}
        {contratado.whatsapp_confirmado && contratado.contrato_aceito && (
          <div className="flex items-center justify-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" />WhatsApp</span>
            <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" />Contrato</span>
          </div>
        )}

        {/* ── LEADER: Link + Liderados ─────────────────────────── */}
        {contratado.is_lider && portalUnlocked && (
          <>
            {/* Exclusive link */}
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-primary" />
                  <p className="text-sm font-semibold">Seu Link de Cadastro para Liderados</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Envie este link para os seus contratados se cadastrarem vinculados a você.
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-background rounded-lg border px-3 py-2 text-xs truncate font-mono">
                    {`${window.location.origin}/contratado/${clientId}/${contratado.id}`}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1.5"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/contratado/${clientId}/${contratado.id}`);
                      toast.success("Link copiado!");
                    }}
                  >
                    <Copy className="w-3.5 h-3.5" />Copiar
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Liderados panel */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    <p className="text-sm font-semibold">Meus Contratados</p>
                  </div>
                  <Badge variant="secondary" className="text-xs">{liderados.length} total</Badge>
                </div>

                {liderados.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Nenhum contratado cadastrado no seu link ainda.
                  </p>
                ) : (
                  <>
                    {/* Alert: who hasn't checked in */}
                    {lideradosSemPresenca.length > 0 && (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="w-4 h-4 text-destructive" />
                          <p className="text-xs font-semibold text-destructive">
                            {lideradosSemPresenca.length} sem presença hoje
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          {lideradosSemPresenca.map(l => (
                            <div key={l.id} className="flex items-center justify-between text-xs">
                              <span className="font-medium truncate">{l.nome}</span>
                              <span className="text-muted-foreground shrink-0 ml-2">
                                {l.lastCheckin ? `Último: ${new Date(l.lastCheckin).toLocaleDateString("pt-BR")}` : "Nunca"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Full list */}
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {liderados.map(l => (
                        <div key={l.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card">
                          <div className="min-w-0">
                            <p className="font-medium text-xs truncate">{l.nome}</p>
                            <p className="text-[11px] text-muted-foreground">📞 {l.telefone}</p>
                          </div>
                          <Badge variant={l.checkedInToday ? "default" : "destructive"} className="text-[10px] shrink-0">
                            {l.checkedInToday ? "✅ Presente" : "❌ Ausente"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* ── TABS: Missions + Indicados (only if unlocked) ──── */}
        {portalUnlocked && (
          <Tabs defaultValue="missoes">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="missoes" className="gap-1.5"><Target className="w-3.5 h-3.5" />Missões</TabsTrigger>
              <TabsTrigger value="indicados" className="gap-1.5">
                <Users className="w-3.5 h-3.5" />Indicados
                <Badge variant={quotaComplete ? "default" : "secondary"} className="ml-1 text-[10px] px-1.5">
                  {indicados.length}/{contratado.quota_indicados}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="missoes" className="space-y-3 mt-3">
              <p className="text-xs text-muted-foreground">Interaja nas postagens abaixo. As missões são atualizadas diariamente.</p>
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
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Meta de indicações</p>
                    <Badge variant={quotaComplete ? "default" : "outline"} className="gap-1">
                      {quotaComplete ? <><Award className="w-3 h-3" />Completo!</> : `${indicados.length}/${contratado.quota_indicados}`}
                    </Badge>
                  </div>
                  <div className="w-full bg-muted rounded-full h-3">
                    <div className={`h-3 rounded-full transition-all ${quotaComplete ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${Math.min(quotaProgress, 100)}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {quotaComplete
                      ? "🎉 Parabéns! Você atingiu sua meta de indicações!"
                      : `Indique ${contratado.quota_indicados - indicados.length} pessoa(s) que dizem votar no candidato.`}
                  </p>
                </CardContent>
              </Card>

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
                      <Input value={indCidade} onChange={e => setIndCidade(e.target.value)} placeholder="Cidade" />
                      <Input value={indBairro} onChange={e => setIndBairro(e.target.value)} placeholder="Bairro" />
                      <Input value={indEndereco} onChange={e => setIndEndereco(e.target.value)} placeholder="Endereço" />
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

              {indicados.map(ind => (
                <div key={ind.id} className="flex items-center justify-between p-3 rounded-xl border bg-card">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{ind.nome}</p>
                    <p className="text-xs text-muted-foreground">📞 {ind.telefone}{ind.cidade ? ` • 📍 ${ind.cidade}` : ""}</p>
                  </div>
                </div>
              ))}
              {indicados.length === 0 && (
                <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhuma indicação ainda. Comece indicando!</CardContent></Card>
              )}
            </TabsContent>
          </Tabs>
        )}

        {contratado && (
          <SocialNetworksEditor
            table="contratados"
            recordId={contratado.id}
            clientId={contratado.client_id}
            initial={contratado.redes_sociais || []}
            onChange={(next) => setContratado({ ...contratado, redes_sociais: next })}
          />
        )}
      </div>
      <InstallAppFab />
    </div>
  );
}
