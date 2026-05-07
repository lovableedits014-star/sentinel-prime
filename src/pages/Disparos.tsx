import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { BordoesBairrosWidget } from "@/components/memoria-widgets/BordoesBairrosWidget";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Send, Loader2, CheckCircle, XCircle, Clock,
  Users, MessageSquare, Wifi, WifiOff, Zap, Target, Settings2, Cake, Ban,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SugestoesPanel } from "@/components/disparos/SugestoesPanel";
import DispatchLogDialog from "@/components/disparos/DispatchLogDialog";
import BirthdayConfigPanel from "@/components/disparos/BirthdayConfigPanel";

const POLICIES = {
  conservador: {
    label: "🛡️ Conservador",
    desc: "5-15s entre msgs, lotes de 10, pausa de 60s (~200 msgs/hora)",
    batch_size: 10, delay_min: 5, delay_max: 15, batch_pause: 60,
  },
  moderado: {
    label: "⚡ Moderado",
    desc: "3-8s entre msgs, lotes de 20, pausa de 30s (~400 msgs/hora)",
    batch_size: 20, delay_min: 3, delay_max: 8, batch_pause: 30,
  },
  agressivo: {
    label: "🔥 Agressivo",
    desc: "2-5s entre msgs, lotes de 30, pausa de 15s (~600 msgs/hora). Risco maior de ban!",
    batch_size: 30, delay_min: 2, delay_max: 5, batch_pause: 15,
  },
} as const;
type PolicyKey = keyof typeof POLICIES;

type DispatchRow = {
  id: string;
  tipo: string;
  titulo: string;
  mensagem_template: string;
  total_destinatarios: number;
  enviados: number;
  falhas: number;
  status: string;
  tag_filtro: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

type TagOption = { nome: string; count: number };

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pendente: { label: "Aguardando", color: "bg-muted text-muted-foreground", icon: Clock },
  enviando: { label: "Enviando...", color: "bg-primary/10 text-primary", icon: Loader2 },
  pausado_timeout: { label: "Retomando…", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400", icon: Loader2 },
  pausado_janela: { label: "Aguardando janela", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400", icon: Clock },
  concluido: { label: "Concluído", color: "bg-emerald-500/15 text-emerald-600", icon: CheckCircle },
  falhou: { label: "Falhou", color: "bg-destructive/10 text-destructive", icon: XCircle },
  cancelado: { label: "Cancelado", color: "bg-muted text-muted-foreground", icon: XCircle },
};

export default function Disparos() {
  const queryClient = useQueryClient();

  const { data: client } = useQuery({
    queryKey: ["client"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const { data } = await supabase.from("clients").select("*").eq("user_id", user.id).maybeSingle();
      return data;
    },
  });

  const clientId = client?.id;

  // WhatsApp Bridge status
  const { data: bridgeConfigured } = useQuery({
    queryKey: ["whatsapp-bridge-status", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-whatsapp-instance", {
        body: { action: "check_bridge", client_id: clientId },
      });
      return !error && data?.configured;
    },
    enabled: !!clientId,
  });

  // Tags for filtering
  const { data: tags = [] } = useQuery<TagOption[]>({
    queryKey: ["dispatch-tags", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tags" as any)
        .select("nome")
        .eq("client_id", clientId);
      return ((data as any[]) || []).map((t: any) => ({ nome: t.nome, count: 0 }));
    },
    enabled: !!clientId,
  });

  // Active missions
  const { data: activeMissions = [] } = useQuery({
    queryKey: ["active-missions", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("portal_missions")
        .select("*")
        .eq("client_id", clientId!)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      return data || [];
    },
    enabled: !!clientId,
  });

  // History filters & pagination
  const [historyStatus, setHistoryStatus] = useState<string>("_all");
  const [historySort, setHistorySort] = useState<"recent" | "oldest">("recent");
  const [historyPage, setHistoryPage] = useState(0);
  const PAGE_SIZE = 10;

  // Reset page when filters change
  useEffect(() => { setHistoryPage(0); }, [historyStatus, historySort]);

  // Dispatch history
  const { data: historyResult, refetch } = useQuery<{ rows: DispatchRow[]; count: number }>({
    queryKey: ["whatsapp-dispatches", clientId, historyStatus, historySort, historyPage],
    queryFn: async () => {
      let q = supabase
        .from("whatsapp_dispatches" as any)
        .select("*", { count: "exact" })
        .eq("client_id", clientId)
        .order("created_at", { ascending: historySort === "oldest" })
        .range(historyPage * PAGE_SIZE, historyPage * PAGE_SIZE + PAGE_SIZE - 1);
      if (historyStatus !== "_all") q = q.eq("status", historyStatus);
      const { data, count } = await q;
      return { rows: (data as unknown as DispatchRow[]) || [], count: count || 0 };
    },
    enabled: !!clientId,
    refetchInterval: (data: any) => {
      const rows = (data?.state?.data?.rows as DispatchRow[] | undefined) || [];
      const hasActive = rows.some(
        (d) => ["pendente","enviando","pausado_timeout","pausado_janela"].includes(d.status)
      );
      return hasActive ? 3000 : false;
    },
  });

  const dispatches = historyResult?.rows || [];
  const totalCount = historyResult?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Realtime for dispatches
  useEffect(() => {
    if (!clientId) return;
    const channel = supabase
      .channel(`whats-dispatches-${clientId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "whatsapp_dispatches",
        filter: `client_id=eq.${clientId}`,
      }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId, refetch]);

  // Composer state
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [tipoDisparo, setTipoDisparo] = useState("manual");
  const [tagFiltro, setTagFiltro] = useState("_all");
  const [eleicaoTipo, setEleicaoTipo] = useState<"all" | "coordenador" | "lider" | "cabo">("all");
  const [eleicaoEscopo, setEleicaoEscopo] = useState<"all" | "campo_grande" | "interior">("all");
  const [eleicaoRegiao, setEleicaoRegiao] = useState<string>("all");
  const [sending, setSending] = useState(false);
  const [politica, setPolitica] = useState<PolicyKey>("conservador");
  const handleUseMissions = () => {
    const links = activeMissions.map((m: any, i: number) => {
      const platformLabel = m.platform === "instagram" ? "📸 Instagram" : "📘 Facebook";
      return `${i + 1}. ${platformLabel} — ${m.title || "Publicação"}\n👉 ${m.post_url}`;
    }).join("\n\n");

    setTitulo("Missão: Interaja nas publicações");
    setMensagem(
      `Olá {nome}! 🎯\n\nTemos missões importantes para você!\n\nAcesse as publicações abaixo e interaja (curta, comente e compartilhe):\n\n${links}\n\nSua participação faz toda a diferença! 💪`
    );
  };

  // Count recipients based on filter
  const { data: recipientCount = 0 } = useQuery<number>({
    queryKey: ["dispatch-recipient-count", clientId, tagFiltro, tipoDisparo, eleicaoTipo, eleicaoEscopo, eleicaoRegiao],
    queryFn: async () => {
      if (tipoDisparo === "eleicao") {
        let q = supabase.from("eleicao_pessoas" as any)
          .select("*", { count: "exact", head: true })
          .eq("client_id", clientId!)
          .not("telefone", "is", null);
        if (eleicaoTipo !== "all") q = q.eq("tipo", eleicaoTipo);
        if (eleicaoEscopo !== "all") q = q.eq("escopo", eleicaoEscopo);
        if (eleicaoRegiao !== "all") q = q.eq("regiao", eleicaoRegiao);
        const { count } = await q;
        return count || 0;
      }
      if (tipoDisparo === "funcionarios") {
        const { count } = await supabase
          .from("funcionarios").select("*", { count: "exact", head: true })
          .eq("client_id", clientId!).eq("status", "ativo").not("telefone", "is", null);
        return count || 0;
      }
      if (tipoDisparo === "contratados") {
        const { count } = await supabase
          .from("contratados").select("*", { count: "exact", head: true })
          .eq("client_id", clientId!).eq("status", "ativo").not("telefone", "is", null);
        return count || 0;
      }
      if (tipoDisparo === "apoiadores") {
        const { count } = await supabase
          .from("pessoas").select("*", { count: "exact", head: true })
          .eq("client_id", clientId!).eq("tipo_pessoa", "apoiador").not("telefone", "is", null);
        return count || 0;
      }
      if (tagFiltro && tagFiltro !== "_all") {
        const { data: tagData } = await supabase
          .from("tags" as any).select("id").eq("client_id", clientId).eq("nome", tagFiltro).maybeSingle();
        if (!tagData) return 0;
        const { count } = await supabase
          .from("pessoas_tags" as any).select("*", { count: "exact", head: true })
          .eq("tag_id", (tagData as any).id);
        return count || 0;
      }
      const { count } = await supabase
        .from("pessoas").select("*", { count: "exact", head: true })
        .eq("client_id", clientId!).not("telefone", "is", null);
      return count || 0;
    },
    enabled: !!clientId,
  });

  const handleSend = async () => {
    if (!titulo.trim() || !mensagem.trim()) {
      toast.error("Preencha título e mensagem");
      return;
    }
    if (recipientCount === 0) {
      toast.error("Nenhum destinatário encontrado com o filtro selecionado");
      return;
    }
    if (!bridgeConfigured) {
      toast.error("Ponte WhatsApp não configurada. Contacte o administrador.");
      return;
    }

    setSending(true);
    try {
      const pol = POLICIES[politica];
      const { error } = await supabase.functions.invoke("send-whatsapp-dispatch", {
        body: {
          client_id: clientId,
          titulo: titulo.trim(),
          mensagem: mensagem.trim(),
          tipo: tipoDisparo,
          tag_filtro: tagFiltro === "_all" ? null : tagFiltro,
          eleicao_tipo: eleicaoTipo === "all" ? null : eleicaoTipo,
          eleicao_escopo: eleicaoEscopo === "all" ? null : eleicaoEscopo,
          eleicao_regiao: eleicaoRegiao === "all" ? null : eleicaoRegiao,
          batch_size: pol.batch_size,
          delay_min: pol.delay_min,
          delay_max: pol.delay_max,
          batch_pause: pol.batch_pause,
        },
      });
      if (error) throw error;

      toast.success("📤 Disparo iniciado! Acompanhe o progresso abaixo.");
      setTitulo("");
      setMensagem("");
      setTagFiltro("_all");
      refetch();
    } catch (err: any) {
      toast.error("Erro: " + (err.message || "tente novamente"));
    } finally {
      setSending(false);
    }
  };

  const handleCancelDispatch = async (dispatchId: string, titulo: string) => {
    try {
      // Marca o disparo como cancelado e zera os pendentes para parar a fila e o cron de resume.
      const { error: e1 } = await supabase
        .from("whatsapp_dispatches" as any)
        .update({
          status: "cancelado",
          pause_reason: "Cancelado pelo usuário",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", dispatchId);
      if (e1) throw e1;

      // Marca itens pendentes como cancelados (não serão mais enviados em retomadas)
      await supabase
        .from("whatsapp_dispatch_items" as any)
        .update({ status: "cancelado", erro: "Disparo cancelado pelo usuário" })
        .eq("dispatch_id", dispatchId)
        .eq("status", "pendente");

      toast.success(`Disparo "${titulo}" cancelado.`);
      refetch();
    } catch (err: any) {
      toast.error("Erro ao cancelar: " + (err.message || "tente novamente"));
    }
  };

  const isConnected = !!bridgeConfigured;
  const activeDispatch = dispatches.find((d) => ["pendente","enviando","pausado_timeout","pausado_janela","pausado_sem_instancia"].includes(d.status));

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Disparos WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Envie mensagens em massa pelo WhatsApp para seus apoiadores. Você pode segmentar por tags, escolher a velocidade de envio e personalizar a mensagem com o nome de cada pessoa. Ideal para campanhas, missões de engajamento e comunicação geral.
        </p>
      </div>

      <Tabs defaultValue="disparos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="disparos" className="gap-1.5">
            <MessageSquare className="h-4 w-4" /> Disparos
          </TabsTrigger>
          <TabsTrigger value="aniversario" className="gap-1.5">
            <Cake className="h-4 w-4" /> Aniversário
          </TabsTrigger>
        </TabsList>

        <TabsContent value="disparos" className="space-y-4 sm:space-y-6">

      {clientId && (
        <BordoesBairrosWidget
          clientId={clientId}
          contexto="Use os bordões e cite promessas relevantes para reforçar a mensagem do disparo."
        />
      )}

      <SugestoesPanel />

      {/* Connection status banner */}
      {!isConnected && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <WifiOff className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <p className="text-sm font-medium">WhatsApp não conectado</p>
              <p className="text-xs text-muted-foreground">
                Vá em Configurações para criar e conectar sua instância WhatsApp antes de enviar disparos.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isConnected && (
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <Wifi className="w-4 h-4 text-emerald-500 shrink-0" />
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              <strong>Ponte WhatsApp configurada</strong> — Pronto para envios
            </p>
          </CardContent>
        </Card>
      )}

      {/* Composer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Novo Disparo
          </CardTitle>
          <CardDescription className="flex items-center gap-2">
            <Settings2 className="h-3.5 w-3.5" />
            {POLICIES[politica].label}: {POLICIES[politica].desc}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5" /> Política de envio
              </Label>
              <Select value={politica} onValueChange={(v) => setPolitica(v as PolicyKey)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conservador">🛡️ Conservador</SelectItem>
                  <SelectItem value="moderado">⚡ Moderado</SelectItem>
                  <SelectItem value="agressivo">🔥 Agressivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de disparo</Label>
              <Select value={tipoDisparo} onValueChange={setTipoDisparo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">📋 Pessoas (CRM)</SelectItem>
                  <SelectItem value="apoiadores">🙋 Apoiadores</SelectItem>
                  <SelectItem value="funcionarios">👷 Funcionários</SelectItem>
                  <SelectItem value="eleicao">🗳️ Eleição (Coord/Líder/Cabo)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {tipoDisparo === "eleicao" && (
              <>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={eleicaoTipo} onValueChange={(v) => setEleicaoTipo(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="coordenador">🔴 Coordenadores</SelectItem>
                      <SelectItem value="lider">🔵 Líderes</SelectItem>
                      <SelectItem value="cabo">🟢 Cabos eleitorais</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Escopo</Label>
                  <Select value={eleicaoEscopo} onValueChange={(v) => { setEleicaoEscopo(v as any); setEleicaoRegiao("all"); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">CG + Interior</SelectItem>
                      <SelectItem value="campo_grande">Campo Grande</SelectItem>
                      <SelectItem value="interior">Interior</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {eleicaoEscopo === "campo_grande" && (
                  <div className="space-y-2">
                    <Label>Região</Label>
                    <Select value={eleicaoRegiao} onValueChange={setEleicaoRegiao}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="centro">Centro</SelectItem>
                        <SelectItem value="segredo">Segredo</SelectItem>
                        <SelectItem value="prosa">Prosa</SelectItem>
                        <SelectItem value="bandeira">Bandeira</SelectItem>
                        <SelectItem value="anhanduizinho">Anhanduizinho</SelectItem>
                        <SelectItem value="lagoa">Lagoa</SelectItem>
                        <SelectItem value="imbirussu">Imbirussu</SelectItem>
                        <SelectItem value="moreninha">Moreninha</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Mission quick-fill button */}
          {activeMissions.length > 0 && (
            <Button variant="outline" size="sm" className="gap-2 border-primary/30 text-primary hover:bg-primary/5" onClick={handleUseMissions}>
              <Target className="h-4 w-4" />
              Preencher com Missões Ativas ({activeMissions.length})
            </Button>
          )}

          <div className="space-y-2">
            <Label>Título do disparo</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Convite para caminhada sábado"
              disabled={sending || !!activeDispatch}
            />
          </div>

          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Olá {nome}! Temos uma missão importante..."
              rows={4}
              disabled={sending || !!activeDispatch}
            />
            <p className="text-xs text-muted-foreground">
              Use <code className="bg-muted px-1 rounded">{"{nome}"}</code> para personalizar com o nome do destinatário.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span>
                <strong>{recipientCount}</strong> destinatário{recipientCount !== 1 ? "s" : ""}
              </span>
            </div>

            <Button
              onClick={handleSend}
              disabled={sending || !!activeDispatch || !isConnected || recipientCount === 0}
            >
              {sending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Iniciando...</>
              ) : activeDispatch ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Envio em andamento...</>
              ) : (
                <><Send className="h-4 w-4 mr-2" /> Enviar</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active dispatch progress */}
      {activeDispatch && (
        <Card className="border-primary/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="font-medium text-sm">Enviando mensagens...</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {activeDispatch.enviados} / {activeDispatch.total_destinatarios}
              </span>
            </div>
            {activeDispatch.total_destinatarios > 0 && (
              <Progress
                value={Math.round((activeDispatch.enviados / activeDispatch.total_destinatarios) * 100)}
                className="h-2"
              />
            )}
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span>✅ {activeDispatch.enviados} enviados</span>
              {activeDispatch.falhas > 0 && <span className="text-destructive">❌ {activeDispatch.falhas} falhas</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dispatch history */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4" /> Histórico de Disparos
              {totalCount > 0 && (
                <span className="text-xs font-normal text-muted-foreground">({totalCount})</span>
              )}
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Select value={historyStatus} onValueChange={setHistoryStatus}>
                <SelectTrigger className="h-8 w-[160px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos os status</SelectItem>
                  <SelectItem value="pendente">Aguardando</SelectItem>
                  <SelectItem value="enviando">Enviando</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                  <SelectItem value="falhou">Falhou</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
              <Select value={historySort} onValueChange={(v) => setHistorySort(v as "recent" | "oldest")}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Mais recentes</SelectItem>
                  <SelectItem value="oldest">Mais antigos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {dispatches.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {historyStatus !== "_all"
                ? "Nenhum disparo encontrado com este filtro."
                : "Nenhum disparo realizado ainda. Crie seu primeiro acima."}
            </div>
          ) : (
            <>
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-2">
                  {dispatches.map((d) => {
                    const cfg = statusConfig[d.status] || statusConfig.pendente;
                    const StatusIcon = cfg.icon;
                    const progress = d.total_destinatarios > 0
                      ? Math.round(((d.enviados + d.falhas) / d.total_destinatarios) * 100)
                      : 0;

                    return (
                      <div key={d.id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{d.titulo}</p>
                            <p className="text-xs text-muted-foreground truncate">{d.mensagem_template.slice(0, 80)}…</p>
                          </div>
                          <Badge className={`${cfg.color} shrink-0 text-xs flex items-center gap-1`}>
                            <StatusIcon className={`h-3 w-3 ${d.status === "enviando" ? "animate-spin" : ""}`} />
                            {cfg.label}
                          </Badge>
                        </div>

                        {(d.status === "enviando" || d.status === "concluido") && d.total_destinatarios > 0 && (
                          <Progress value={progress} className="h-1.5" />
                        )}

                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>👥 {d.total_destinatarios}</span>
                          {d.enviados > 0 && <span>✅ {d.enviados}</span>}
                          {d.falhas > 0 && <span className="text-destructive">❌ {d.falhas}</span>}
                          {d.tag_filtro && (
                            <Badge variant="outline" className="text-xs h-4 px-1">
                              🏷 {d.tag_filtro}
                            </Badge>
                          )}
                          <DispatchLogDialog dispatchId={d.id} titulo={d.titulo} />
                          <span className="ml-auto">
                            {new Date(d.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>

                        {d.error_message && (
                          <p className="text-xs text-destructive bg-destructive/10 rounded p-1.5">{d.error_message}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-2 pt-3 mt-2 border-t">
                  <span className="text-xs text-muted-foreground">
                    Página {historyPage + 1} de {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={historyPage === 0}
                      onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={historyPage >= totalPages - 1}
                      onClick={() => setHistoryPage((p) => p + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="aniversario">
          {clientId ? (
            <BirthdayConfigPanel clientId={clientId} />
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Sua conta não está vinculada a nenhum cliente. Vincule um cliente para configurar disparos de aniversário.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
