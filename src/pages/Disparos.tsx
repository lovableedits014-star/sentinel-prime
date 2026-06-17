import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { useWhatsAppGroups } from "@/hooks/useWhatsAppGroups";
import { Checkbox } from "@/components/ui/checkbox";
import { BordoesBairrosWidget } from "@/components/memoria-widgets/BordoesBairrosWidget";
import { useRegioesEleicao } from "@/hooks/useRegioesEleicao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  Send, Loader2, CheckCircle, XCircle, Clock,
  Users, MessageSquare, Wifi, WifiOff, Zap, Target, Settings2, Cake, Ban, Sparkles, Star, ImagePlus, X,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
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
  furtivo: {
    label: "🥷 Furtivo (anti-ban)",
    desc: "25-90s entre msgs, lotes de 5, pausa de 180s (~80 msgs/h). Intervalos bem variados para parecer humano.",
    batch_size: 5, delay_min: 25, delay_max: 90, batch_pause: 180,
  },
  personalizado: {
    label: "⚙️ Personalizado",
    desc: "Defina manualmente lote, delay mín/máx e pausa entre lotes.",
    batch_size: 8, delay_min: 15, delay_max: 60, batch_pause: 120,
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
  enfileirado: { label: "Na fila", color: "bg-sky-500/15 text-sky-700 dark:text-sky-400", icon: Clock },
  enviando: { label: "Enviando...", color: "bg-primary/10 text-primary", icon: Loader2 },
  pausado_timeout: { label: "Retomando…", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400", icon: Loader2 },
  pausado_janela: { label: "Aguardando janela", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400", icon: Clock },
  pausado_sem_instancia: { label: "Sem instância", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400", icon: WifiOff },
  concluido: { label: "Concluído", color: "bg-emerald-500/15 text-emerald-600", icon: CheckCircle },
  falhou: { label: "Falhou", color: "bg-destructive/10 text-destructive", icon: XCircle },
  cancelado: { label: "Cancelado", color: "bg-muted text-muted-foreground", icon: XCircle },
};

export default function Disparos() {
  const queryClient = useQueryClient();

  const { data: client } = useQuery({
    queryKey: ["client-with-active", "disparos"],
    queryFn: async () => {
      const { resolveClientId } = await import("@/lib/resolveClientId");
      const cId = await resolveClientId();
      if (!cId) return null;
      const { data } = await supabase.from("clients").select("*").eq("id", cId).maybeSingle();
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
        (d) => ["pendente","enfileirado","enviando","pausado_timeout","pausado_janela","pausado_sem_instancia"].includes(d.status)
      );
      return hasActive ? 3000 : false;
    },
  });

  const dispatches = historyResult?.rows || [];
  const totalCount = historyResult?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const { data: activeQueueDispatches = [] } = useQuery<DispatchRow[]>({
    queryKey: ["whatsapp-dispatch-queue", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_dispatches" as any)
        .select("*")
        .eq("client_id", clientId)
        .in("status", ["pendente","enfileirado","enviando","pausado_timeout","pausado_janela","pausado_sem_instancia"])
        .order("created_at", { ascending: true });
      return (data as unknown as DispatchRow[]) || [];
    },
    enabled: !!clientId,
    refetchInterval: 3000,
  });

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
      }, () => {
        refetch();
        queryClient.invalidateQueries({ queryKey: ["whatsapp-dispatch-queue", clientId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId, refetch]);

  // Composer state
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [tipoDisparo, setTipoDisparo] = useState("manual");
  const [tagFiltro, setTagFiltro] = useState("_all");
  const [eleicaoTipo, setEleicaoTipo] = useState<"all" | "coordenador" | "lider" | "cabo">("all");
  const [eleicaoEscopo, setEleicaoEscopo] = useState<"all" | "campo_grande" | "interior">("all");
  const [eleicaoRegiao, setEleicaoRegiao] = useState<string>("all");
  const [sending, setSending] = useState(false);
  const [politica, setPolitica] = useState<PolicyKey>("conservador");
  const [customPol, setCustomPol] = useState({ batch_size: 8, delay_min: 15, delay_max: 60, batch_pause: 120 });
  const { regioes: regioesCadastradas } = useRegioesEleicao(clientId);
  const [groupSearch, setGroupSearch] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [selectedGroupJids, setSelectedGroupJids] = useState<string[]>([]);
  const [confirmSyncGroupsOpen, setConfirmSyncGroupsOpen] = useState(false);
  const [syncStartedAt, setSyncStartedAt] = useState<number | null>(null);
  const [syncElapsedMs, setSyncElapsedMs] = useState(0);
  const {
    groups: waGroups,
    isLoading: loadingGroups,
    totalActive: groupsTotalActive,
    inactiveCount: groupsInactiveCount,
    noPostCount: groupsNoPostCount,
    favoriteCount: groupsFavoriteCount,
    withBackupCount: groupsWithBackup,
    withoutBackupCount: groupsWithoutBackup,
    backupCoveragePct: groupsBackupPct,
    lastSyncedAt: groupsLastSyncedAt,
    isSyncing: groupsSyncing,
    syncingInstanceId,
    syncFromPrimary: syncGroupsFromPrimary,
    syncFromInstance: syncGroupsFromInstance,
    syncFromMany: syncGroupsFromMany,
    toggleFavorite: toggleGroupFavorite,
    lastError: groupsLastError,
    hasPrimaryInstance,
    primaryConnected,
    primaryInstance,
    instances: waInstances,
    connectedInstances: waConnectedInstances,
    syncLogs: groupsSyncLogs,
    clearSyncLogs: clearGroupsSyncLogs,
  } = useWhatsAppGroups(clientId);
  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    let list = waGroups;
    if (onlyFavorites) list = list.filter((g) => g.is_favorite);
    if (q) list = list.filter((g) => (g.name || g.group_jid).toLowerCase().includes(q));
    // Favoritos sempre primeiro, depois alfabético
    return [...list].sort((a, b) => {
      if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
      return (a.name || a.group_jid).localeCompare(b.name || b.group_jid, "pt-BR");
    });
  }, [waGroups, groupSearch, onlyFavorites]);
  const totalGroupMembers = useMemo(
    () => waGroups.filter((g) => selectedGroupJids.includes(g.group_jid))
      .reduce((s, g) => s + (g.participants_count || 0), 0),
    [waGroups, selectedGroupJids]
  );

  // Cronômetro / progresso da sincronização de grupos
  useEffect(() => {
    if (groupsSyncing) {
      const start = Date.now();
      setSyncStartedAt(start);
      setSyncElapsedMs(0);
      const t = window.setInterval(() => setSyncElapsedMs(Date.now() - start), 250);
      return () => window.clearInterval(t);
    }
    setSyncStartedAt(null);
  }, [groupsSyncing]);
  const latestSyncLog = groupsSyncLogs[0];
  const handleUseMissions = () => {
    const links = activeMissions.map((m: any, i: number) => {
      const platformLabel = m.platform === "instagram" ? "📸 Instagram" : "📘 Facebook";
      return `${i + 1}. ${platformLabel} — ${m.title || "Publicação"}\n👉 ${m.post_url}`;
    }).join("\n\n");

    setTitulo("Missão: Interaja nas publicações");
    // Em envio para grupos não existe destinatário individual — não usar {nome}
    const saudacao = tipoDisparo === "grupos"
      ? "Pessoal! 🎯"
      : "Olá {nome}! 🎯";
    const cta = tipoDisparo === "grupos"
      ? "A participação de cada um faz toda a diferença! 💪"
      : "Sua participação faz toda a diferença! 💪";
    setMensagem(
      `${saudacao}\n\nTemos missões importantes${tipoDisparo === "grupos" ? " para o grupo" : " para você"}!\n\nAcesse as publicações abaixo e interaja (curta, comente e compartilhe):\n\n${links}\n\n${cta}`
    );
  };

  // Count recipients based on filter
  const { data: recipientCount = 0 } = useQuery<number>({
    queryKey: ["dispatch-recipient-count", clientId, tagFiltro, tipoDisparo, eleicaoTipo, eleicaoEscopo, eleicaoRegiao, selectedGroupJids.length],
    queryFn: async () => {
      if (tipoDisparo === "grupos") return selectedGroupJids.length;
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

  const handleMediaUpload = async (file: File) => {
    if (!clientId) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 8MB).");
      return;
    }
    setMediaUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `dispatches/${clientId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("whatsapp-media").upload(path, file, {
        cacheControl: "3600", upsert: false, contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("whatsapp-media").getPublicUrl(path);
      setMediaUrl(pub.publicUrl);
      toast.success("Imagem anexada.");
    } catch (err: any) {
      toast.error("Falha ao enviar imagem: " + (err.message || ""));
    } finally {
      setMediaUploading(false);
    }
  };

  const handleSend = async () => {
    const hasText = !!mensagem.trim();
    const hasMedia = !!mediaUrl;
    if (!hasText && !hasMedia) {
      toast.error("Escreva uma mensagem ou anexe uma imagem");
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
      const basePol = POLICIES[politica];
      const pol = politica === "personalizado" ? { ...basePol, ...customPol } : basePol;
      if (politica === "personalizado") {
        if (customPol.delay_max < customPol.delay_min || customPol.delay_min < 1 || customPol.batch_size < 1 || customPol.batch_pause < 0) {
          toast.error("Valores inválidos na política personalizada (delay máx ≥ delay mín, valores ≥ 1).");
          setSending(false);
          return;
        }
      }
      const tituloFinal = titulo.trim() || (hasMedia && !hasText ? "Imagem" : (mensagem.trim().slice(0, 60) || "Disparo"));
      const { data: resp, error } = await supabase.functions.invoke("send-whatsapp-dispatch", {
        body: {
          client_id: clientId,
          titulo: tituloFinal,
          mensagem: mensagem.trim(),
          media_url: mediaUrl,
          tipo: tipoDisparo,
          tag_filtro: tagFiltro === "_all" ? null : tagFiltro,
          eleicao_tipo: eleicaoTipo === "all" ? null : eleicaoTipo,
          eleicao_escopo: eleicaoEscopo === "all" ? null : eleicaoEscopo,
          eleicao_regiao: eleicaoRegiao === "all" ? null : eleicaoRegiao,
          group_jids: tipoDisparo === "grupos" ? selectedGroupJids : undefined,
          batch_size: pol.batch_size,
          delay_min: pol.delay_min,
          delay_max: pol.delay_max,
          batch_pause: pol.batch_pause,
        },
      });
      if (error) throw error;

      if ((resp as any)?.queued) {
        toast.success("📥 Adicionado à fila! Será enviado assim que o disparo atual terminar.");
      } else {
        toast.success("📤 Disparo iniciado! Acompanhe o progresso abaixo.");
      }
      setTitulo("");
      setMensagem("");
      setMediaUrl(null);
      setTagFiltro("_all");
      setSelectedGroupJids([]);
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
      // Promove o próximo da fila (se houver)
      try {
        await supabase.functions.invoke("send-whatsapp-dispatch", {
          body: { action: "promote_queue", client_id: clientId },
        });
      } catch { /* não bloqueia o cancelamento */ }
      refetch();
    } catch (err: any) {
      toast.error("Erro ao cancelar: " + (err.message || "tente novamente"));
    }
  };

  const isConnected = !!bridgeConfigured;
  const activeDispatch = activeQueueDispatches.find((d) => ["pendente","enviando","pausado_timeout","pausado_janela","pausado_sem_instancia"].includes(d.status));
  const queuedDispatches = activeQueueDispatches.filter((d) => d.status === "enfileirado");

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
                  <SelectItem value="furtivo">🥷 Furtivo (anti-ban)</SelectItem>
                  <SelectItem value="personalizado">⚙️ Personalizado</SelectItem>
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
                  <SelectItem value="grupos">👥 Grupos de WhatsApp</SelectItem>
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
                        {(() => {
                          const defaults = [
                            { value: "centro", label: "Centro" },
                            { value: "segredo", label: "Segredo" },
                            { value: "prosa", label: "Prosa" },
                            { value: "bandeira", label: "Bandeira" },
                            { value: "anhanduizinho", label: "Anhanduizinho" },
                            { value: "lagoa", label: "Lagoa" },
                            { value: "imbirussu", label: "Imbirussu" },
                            { value: "moreninha", label: "Moreninha" },
                          ];
                          const seen = new Set<string>();
                          const merged: { value: string; label: string }[] = [];
                          for (const r of [...regioesCadastradas, ...defaults]) {
                            if (!r.value || seen.has(r.value)) continue;
                            seen.add(r.value);
                            merged.push({ value: r.value, label: r.label });
                          }
                          merged.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
                          return merged.map((r) => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
          </div>


          {/* Seletor de grupos */}
          {tipoDisparo === "grupos" && (
            <div className="space-y-2 border rounded-md p-3 bg-muted/20">
              <AlertDialog open={confirmSyncGroupsOpen} onOpenChange={setConfirmSyncGroupsOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sincronizar grupos do WhatsApp?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Vamos consultar a instância principal{primaryInstance?.apelido ? ` "${primaryInstance.apelido}"` : ""} e atualizar a lista de grupos (nome, foto, membros e permissões). Os grupos favoritados ⭐ são preservados.
                      {groupsLastSyncedAt && (
                        <> A última sincronização foi em {new Date(groupsLastSyncedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.</>
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => syncGroupsFromPrimary()}>
                      Sincronizar agora
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              {/* Botão principal (sincroniza a instância principal) + dropdown de outras instâncias */}
              <div className="flex w-full gap-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 gap-2 border-blue-500/40 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                  onClick={() => setConfirmSyncGroupsOpen(true)}
                  disabled={groupsSyncing || !hasPrimaryInstance || !primaryConnected}
                  title={
                    !hasPrimaryInstance
                      ? "Defina uma instância como Principal em Configurações → WhatsApp"
                      : !primaryConnected
                      ? "Instância principal desconectada"
                      : "Sincronizar grupos da instância principal"
                  }
                >
                  {groupsSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                  Sincronizar grupos
                  {primaryInstance?.apelido ? ` (${primaryInstance.apelido})` : ""}
                  {groupsTotalActive > 0 ? ` · ${groupsTotalActive}` : ""}
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="border-blue-500/40 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 shrink-0"
                      disabled={groupsSyncing || waInstances.length === 0}
                      title="Sincronizar de outras instâncias"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuLabel>Sincronizar de…</DropdownMenuLabel>
                    <DropdownMenuItem
                      disabled={groupsSyncing || waConnectedInstances.length < 2}
                      onSelect={(e) => { e.preventDefault(); syncGroupsFromMany(); }}
                    >
                      <Zap className="h-3.5 w-3.5 mr-2" />
                      <div className="flex-1">
                        <div className="text-sm">Todas as instâncias conectadas</div>
                        <div className="text-[11px] text-muted-foreground">
                          {waConnectedInstances.length} conectada(s) — sincroniza em sequência
                        </div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {waInstances.length === 0 && (
                      <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                        Nenhuma instância cadastrada
                      </div>
                    )}
                    {waInstances.map((inst) => {
                      const connected = ["connected", "open"].includes(String(inst.status || "").toLowerCase());
                      const syncingThis = syncingInstanceId === inst.id;
                      return (
                        <DropdownMenuItem
                          key={inst.id}
                          disabled={groupsSyncing || !connected}
                          onSelect={(e) => { e.preventDefault(); syncGroupsFromInstance(inst.id); }}
                          className="gap-2"
                        >
                          {syncingThis ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : connected ? (
                            <Wifi className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm flex items-center gap-1.5 truncate">
                              {inst.apelido || `Instância ${inst.id.slice(0, 8)}`}
                              {inst.is_primary && (
                                <Badge variant="secondary" className="h-4 px-1 text-[9px]">principal</Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {inst.phone_number || "—"} · {connected ? "conectada" : (inst.status || "desconectada")}
                            </div>
                          </div>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Indicador de progresso em tempo real */}
              {(groupsSyncing || (latestSyncLog && syncElapsedMs > 0 && Date.now() - new Date(latestSyncLog.ts).getTime() < 4000)) && (
                <div className="rounded-md border border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20 p-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-blue-700 dark:text-blue-300 min-w-0">
                      {groupsSyncing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                      ) : latestSyncLog?.level === "error" ? (
                        <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                      ) : (
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      )}
                      <span className="truncate">
                        {latestSyncLog?.message || "Iniciando sincronização…"}
                      </span>
                    </span>
                    <span className="tabular-nums text-muted-foreground shrink-0">
                      {(syncElapsedMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                  <div className="relative h-1 w-full overflow-hidden rounded-full bg-blue-200/60 dark:bg-blue-900/40">
                    {groupsSyncing ? (
                      <div className="absolute inset-y-0 w-1/3 rounded-full bg-blue-500 animate-[indeterminate_1.2s_ease-in-out_infinite]" />
                    ) : (
                      <div className={`absolute inset-y-0 left-0 w-full rounded-full ${latestSyncLog?.level === "error" ? "bg-destructive" : "bg-emerald-500"}`} />
                    )}
                  </div>
                </div>
              )}
              {/* Status dos grupos */}
              <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-border/50">
                <Badge variant="secondary" className="gap-1">
                  <Users className="h-3 w-3" />
                  {groupsTotalActive} grupo(s) ativo(s)
                </Badge>
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {groupsLastSyncedAt
                    ? `Sincronizado ${new Date(groupsLastSyncedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`
                    : "Nunca sincronizado"}
                </Badge>
                {groupsNoPostCount > 0 && (
                  <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400">
                    <Ban className="h-3 w-3" />
                    {groupsNoPostCount} sem permissão de envio
                  </Badge>
                )}
                {groupsTotalActive > 0 && (
                  <Badge
                    variant="outline"
                    className={
                      groupsWithoutBackup === 0
                        ? "gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                        : groupsBackupPct >= 50
                          ? "gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400"
                          : "gap-1 border-destructive/40 text-destructive"
                    }
                    title={`${groupsWithBackup} de ${groupsTotalActive} grupo(s) também são vistos por uma instância de backup. Se a principal cair, esses continuam recebendo disparo.`}
                  >
                    <Users className="h-3 w-3" />
                    {groupsWithoutBackup === 0
                      ? `100% com backup`
                      : `${groupsBackupPct}% com backup · ${groupsWithoutBackup} sem`}
                  </Badge>
                )}
                {groupsInactiveCount > 0 && (
                  <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                    <XCircle className="h-3 w-3" />
                    {groupsInactiveCount} removido(s) do WhatsApp
                  </Badge>
                )}
                {hasPrimaryInstance && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs gap-1 ml-auto"
                    onClick={() => setConfirmSyncGroupsOpen(true)}
                    disabled={groupsSyncing || !primaryConnected}
                    title={!primaryConnected ? "Instância principal desconectada" : "Re-sincronizar agora"}
                  >
                    {groupsSyncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                    {groupsLastSyncedAt ? "Re-sincronizar" : "Sincronizar"}
                  </Button>
                )}
              </div>

              {/* Erro da última sincronização */}
              {groupsLastError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1">
                  <div className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-destructive">
                        {groupsLastError.isUnsupportedAction
                          ? "Ponte WhatsApp desatualizada"
                          : groupsLastError.isNotConnected
                          ? "Instância não conectada"
                          : "Falha ao sincronizar grupos"}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 break-words">
                        {groupsLastError.isUnsupportedAction
                          ? "A bridge não reconhece a action 'sync_groups'. Atualize a bridge ou peça ao suporte para liberar o endpoint 'chats'."
                          : groupsLastError.isNotConnected
                          ? "Conecte a instância principal em Configurações → WhatsApp e tente novamente."
                          : groupsLastError.message}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm">Grupos disponíveis</Label>
                <span className="text-xs text-muted-foreground">
                  {selectedGroupJids.length} selecionado(s) · ~{totalGroupMembers} membros
                </span>
              </div>
              {waGroups.length === 0 && !loadingGroups ? (
                <div className="rounded-md border border-dashed bg-background/50 p-4 space-y-3 text-center">
                  <Users className="h-8 w-8 text-muted-foreground/50 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Nenhum grupo disponível ainda</p>
                    <p className="text-xs text-muted-foreground">
                      {!hasPrimaryInstance ? (
                        <>Defina uma instância como <strong>Principal</strong> em <strong>Configurações → WhatsApp</strong> para poder sincronizar os grupos.</>
                      ) : !primaryConnected ? (
                        <>A instância principal <strong>{primaryInstance?.apelido || ""}</strong> está desconectada. Conecte-a em <strong>Configurações → WhatsApp</strong> antes de sincronizar.</>
                      ) : groupsLastError ? (
                        <>A última sincronização falhou — corrija o erro acima e tente novamente.</>
                      ) : (
                        <>Clique em <strong>Sincronizar agora</strong> para listar os grupos do WhatsApp da instância principal{primaryInstance?.apelido ? ` "${primaryInstance.apelido}"` : ""}.</>
                      )}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => setConfirmSyncGroupsOpen(true)}
                    disabled={groupsSyncing || !hasPrimaryInstance || !primaryConnected}
                  >
                    {groupsSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
                    Sincronizar agora
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    placeholder="Buscar grupo..."
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <Button
                      type="button" size="sm"
                      variant={onlyFavorites ? "default" : "outline"}
                      className="h-6 text-xs px-2 gap-1"
                      onClick={() => setOnlyFavorites((v) => !v)}
                      title="Mostrar apenas grupos marcados como favoritos"
                    >
                      <Star className={`h-3 w-3 ${onlyFavorites ? "fill-current" : ""}`} />
                      Favoritos{groupsFavoriteCount > 0 ? ` (${groupsFavoriteCount})` : ""}
                    </Button>
                    <Button
                      type="button" size="sm" variant="ghost" className="h-6 text-xs px-2"
                      onClick={() => setSelectedGroupJids(filteredGroups.map((g) => g.group_jid))}
                    >Selecionar todos</Button>
                    {groupsFavoriteCount > 0 && (
                      <Button
                        type="button" size="sm" variant="ghost" className="h-6 text-xs px-2"
                        onClick={() => setSelectedGroupJids(
                          waGroups.filter((g) => g.is_favorite && !(g.is_announcement && !g.is_admin)).map((g) => g.group_jid)
                        )}
                      >Selecionar favoritos</Button>
                    )}
                    <Button
                      type="button" size="sm" variant="ghost" className="h-6 text-xs px-2"
                      onClick={() => setSelectedGroupJids([])}
                    >Limpar</Button>
                  </div>
                  <ScrollArea className="h-56 border rounded-md bg-background">
                    <div className="p-1">
                      {filteredGroups.map((g) => {
                        const checked = selectedGroupJids.includes(g.group_jid);
                        const cantSend = g.is_announcement && !g.is_admin;
                        return (
                          <div
                            key={g.group_jid}
                            className={`flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 ${cantSend ? "opacity-50" : ""}`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleGroupFavorite(g.id, !g.is_favorite)}
                              className="p-1 -m-1 rounded hover:bg-muted shrink-0"
                              title={g.is_favorite ? "Remover dos favoritos" : "Marcar como favorito"}
                              aria-label={g.is_favorite ? "Remover dos favoritos" : "Marcar como favorito"}
                            >
                              <Star className={`h-4 w-4 ${g.is_favorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                            </button>
                            <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                              <Checkbox
                                checked={checked}
                                disabled={cantSend}
                                onCheckedChange={(v) => {
                                  setSelectedGroupJids((prev) =>
                                    v ? [...prev, g.group_jid] : prev.filter((j) => j !== g.group_jid)
                                  );
                                }}
                              />
                              <Avatar className="h-9 w-9 shrink-0">
                                {g.picture_url ? <AvatarImage src={g.picture_url} alt={g.name || g.group_jid} /> : null}
                                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                  {(g.name || "G").slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-sm truncate font-medium">{g.name || g.group_jid}</p>
                                  {(() => {
                                    const backupCount = Math.max(0, (g.instance_ids?.length ?? 1) - 1);
                                    if (backupCount === 0) {
                                      return (
                                        <Badge
                                          variant="outline"
                                          className="h-4 px-1 text-[9px] gap-0.5 border-destructive/40 text-destructive"
                                          title="Apenas a instância principal enxerga este grupo. Se ela cair, ninguém envia para ele."
                                        >
                                          <Ban className="h-2.5 w-2.5" />
                                          sem backup
                                        </Badge>
                                      );
                                    }
                                    return (
                                      <Badge
                                        variant="outline"
                                        className="h-4 px-1 text-[9px] gap-0.5 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                                        title={`Coberto por ${g.instance_ids?.length ?? 1} instância(s) — ${backupCount} backup(s) disponível(is).`}
                                      >
                                        +{backupCount} backup
                                      </Badge>
                                    );
                                  })()}
                                </div>
                                <p className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap">
                                  <Users className="h-3 w-3" />
                                  {g.participants_count} membros
                                  {g.is_admin ? " · admin" : ""}
                                  {cantSend ? " · só admins postam" : ""}
                                </p>
                              </div>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </>
              )}

              {/* Logs de sincronização */}
              {(groupsSyncLogs.length > 0 || groupsSyncing) && (
                <div className="mt-2 border rounded-md bg-background/60">
                  <div className="flex items-center justify-between px-2 py-1.5 border-b">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <MessageSquare className="h-3 w-3" />
                      Logs de sincronização
                      {groupsSyncing && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                    </span>
                    {groupsSyncLogs.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[10px] text-muted-foreground"
                        onClick={clearGroupsSyncLogs}
                      >
                        Limpar
                      </Button>
                    )}
                  </div>
                  <ScrollArea className="h-32">
                    <ul className="p-2 space-y-1 font-mono text-[11px] leading-snug">
                      {groupsSyncLogs.length === 0 ? (
                        <li className="text-muted-foreground italic">Aguardando…</li>
                      ) : (
                        groupsSyncLogs.map((log) => (
                          <li
                            key={log.id}
                            className={
                              log.level === "error"
                                ? "text-destructive"
                                : log.level === "success"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-foreground/80"
                            }
                          >
                            <span className="text-muted-foreground mr-2">
                              {new Date(log.ts).toLocaleTimeString("pt-BR", { hour12: false })}
                            </span>
                            {log.message}
                          </li>
                        ))
                      )}
                    </ul>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {activeMissions.length > 0 && (
              <Button variant="outline" size="sm" className="gap-2 border-primary/30 text-primary hover:bg-primary/5" onClick={handleUseMissions}>
                <Target className="h-4 w-4" />
                Preencher com Missões Ativas ({activeMissions.length})
              </Button>
            )}
            {clientId && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-primary/30 text-primary hover:bg-primary/5"
                onClick={() => {
                  const link = `${window.location.origin}/foto/${clientId}`;
                  setTitulo("Monte sua foto oficial da campanha");
                  setMensagem(
                    `Olá {nome}! 📸\n\nQueremos você na nossa campanha! Monte agora sua foto de perfil com a moldura oficial e use no WhatsApp e nas redes sociais.\n\nÉ rapidinho — basta acessar o link, enviar sua foto e baixar a versão pronta:\n\n👉 ${link}\n\nDepois compartilhe com os amigos para fortalecer ainda mais a nossa força! 💪`
                  );
                }}
              >
                <Sparkles className="h-4 w-4" />
                Preencher com Foto da Campanha
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <Label>Título do disparo</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Convite para caminhada sábado"
              disabled={sending}
            />
          </div>

          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Olá {nome}! Temos uma missão importante..."
              rows={4}
              disabled={sending}
            />
            <p className="text-xs text-muted-foreground">
              Use <code className="bg-muted px-1 rounded">{"{nome}"}</code> para personalizar com o nome do destinatário.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Imagem (opcional)</Label>
            {mediaUrl ? (
              <div className="flex items-start gap-3 p-2 border rounded-md bg-muted/30">
                <img src={mediaUrl} alt="anexo" className="w-20 h-20 object-cover rounded" />
                <div className="flex-1 text-xs text-muted-foreground break-all">
                  Imagem anexada — será enviada como mídia com a mensagem acima como legenda.
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMediaUrl(null)}
                  disabled={sending}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  id="dispatch-media-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={sending || mediaUploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleMediaUpload(f);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={sending || mediaUploading}
                  onClick={() => document.getElementById("dispatch-media-input")?.click()}
                >
                  {mediaUploading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                  ) : (
                    <><ImagePlus className="w-4 h-4 mr-2" /> Anexar imagem</>
                  )}
                </Button>
                <span className="text-xs text-muted-foreground">JPG/PNG até 8MB. Enviada para contatos e grupos.</span>
              </div>
            )}
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
              disabled={sending || !isConnected || recipientCount === 0}
            >
              {sending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Iniciando...</>
              ) : activeDispatch ? (
                <><Clock className="h-4 w-4 mr-2" /> Adicionar à fila</>
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
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                <span className="font-medium text-sm truncate">{activeDispatch.titulo}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {activeDispatch.enviados} / {activeDispatch.total_destinatarios}
                </span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="h-7 gap-1">
                      <Ban className="h-3.5 w-3.5" /> Cancelar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancelar disparo?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Os {Math.max(0, activeDispatch.total_destinatarios - activeDispatch.enviados - activeDispatch.falhas)} envios pendentes serão interrompidos.
                        Mensagens já enviadas não podem ser revertidas.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Voltar</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => handleCancelDispatch(activeDispatch.id, activeDispatch.titulo)}
                      >
                        Sim, cancelar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
            {activeDispatch.total_destinatarios > 0 && (
              <Progress
                value={Math.round((activeDispatch.enviados / activeDispatch.total_destinatarios) * 100)}
                className="h-2"
              />
            )}
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
              <span>✅ {activeDispatch.enviados} enviados</span>
              {activeDispatch.falhas > 0 && <span className="text-destructive">❌ {activeDispatch.falhas} falhas</span>}
              {activeDispatch.status !== "enviando" && (
                <span className="text-amber-600">⏸ {statusConfig[activeDispatch.status]?.label || activeDispatch.status}</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {queuedDispatches.length > 0 && (
        <Card className="border-sky-500/30 bg-sky-500/5">
          <CardContent className="py-3 px-4 flex items-center gap-3 text-sm">
            <Clock className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-medium text-sky-700 dark:text-sky-400">
                {queuedDispatches.length} disparo{queuedDispatches.length > 1 ? "s" : ""} na fila
              </span>
              <span className="text-muted-foreground"> · serão enviados em sequência</span>
              <div className="text-xs text-muted-foreground truncate mt-0.5">
                Próximos: {queuedDispatches.slice(0, 3).map((d) => d.titulo).join(" • ")}
                {queuedDispatches.length > 3 ? ` • +${queuedDispatches.length - 3}` : ""}
              </div>
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
                  <SelectItem value="enfileirado">Na fila</SelectItem>
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
                          {["pendente","enfileirado","enviando","pausado_timeout","pausado_janela","pausado_sem_instancia"].includes(d.status) && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-destructive hover:text-destructive">
                                  <Ban className="h-3 w-3" /> Cancelar
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Cancelar disparo?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    "{d.titulo}" será interrompido. {Math.max(0, d.total_destinatarios - d.enviados - d.falhas)} envios pendentes não serão entregues.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => handleCancelDispatch(d.id, d.titulo)}
                                  >
                                    Sim, cancelar
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
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
