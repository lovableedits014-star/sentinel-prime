import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MessageSquare, TrendingUp, TrendingDown, Minus, AlertCircle,
  RefreshCw, Loader2, Users, Shield, Sparkles, Activity, ShieldAlert,
} from "lucide-react";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CommentItem, type CommentData } from "@/components/CommentItem";
import { IEDPanel } from "@/components/IEDPanel";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";
import { AlertasWidget } from "@/components/dashboard/AlertasWidget";
import { AuditPanel } from "@/components/dashboard/AuditPanel";
import { DataHealthAlerts } from "@/components/dashboard/DataHealthAlerts";
import { SuggestedActions } from "@/components/dashboard/SuggestedActions";
import { FeriadosWidget } from "@/components/dashboard/FeriadosWidget";
import { Checkbox } from "@/components/ui/checkbox";
import { EyeOff } from "lucide-react";
import { exportDashboardPdf } from "@/lib/dashboard-pdf-export";
import { syncCooldownRemaining, markSyncDone, formatCooldown } from "@/lib/sync-throttle";

interface DashboardComment {
  id: string;
  comment_id: string;
  post_id: string;
  client_id: string;
  sentiment: string | null;
  status: string | null;
  created_at: string;
  comment_created_time: string | null;
  author_name: string | null;
  author_id: string | null;
  author_profile_picture: string | null;
  text: string;
  platform: string | null;
  platform_user_id: string | null;
  social_profile_id: string | null;
  author_unavailable: boolean;
  author_unavailable_reason: string | null;
  ai_response: string | null;
  final_response: string | null;
  post_message: string | null;
  post_permalink_url: string | null;
  post_full_picture: string | null;
  post_media_type: string | null;
  parent_comment_id: string | null;
  is_page_owner: boolean;
  is_hidden: boolean;
}

interface TimelineData {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
}

const Dashboard = () => {
  const [syncing, setSyncing] = useState(false);
  const [analyzingSentiments, setAnalyzingSentiments] = useState(false);
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [clientId, setClientId] = useState<string>("");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [generatingResponse, setGeneratingResponse] = useState<string | null>(null);
  const [responding, setResponding] = useState<string | null>(null);
  const [managingComment, setManagingComment] = useState<string | null>(null);
  const [reactingComment, setReactingComment] = useState<string | null>(null);
  const [classifyingComment, setClassifyingComment] = useState<string | null>(null);
  const [selectedCrisis, setSelectedCrisis] = useState<Set<string>>(new Set());
  const [bulkHiding, setBulkHiding] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const queryClient = useQueryClient();

  const fetchDashboardData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No user");

    const { data: clients } = await supabase
      .from("clients")
      .select("id")
      .eq("user_id", user.id);

    if (!clients || clients.length === 0) return { allComments: [] as DashboardComment[], supportersCount: 0, clientId: "" };

    const cId = clients[0].id;

    // Fetch ALL comments (paginated)
    const PAGE_SIZE = 1000;
    let allData: DashboardComment[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data } = await supabase
        .from("comments")
        .select("id, comment_id, post_id, client_id, sentiment, status, created_at, comment_created_time, author_name, author_id, author_profile_picture, text, platform, platform_user_id, social_profile_id, author_unavailable, author_unavailable_reason, ai_response, final_response, post_message, post_permalink_url, post_full_picture, post_media_type, parent_comment_id, is_page_owner, is_hidden")
        .eq("client_id", cId)
        .not("text", "eq", "__post_stub__")
        .eq("is_page_owner", false)
        .order("comment_created_time", { ascending: false })
        .range(from, to);

      if (data) allData = [...allData, ...data as DashboardComment[]];
      hasMore = (data?.length || 0) === PAGE_SIZE;
      page++;
    }

    // Fetch supporters count
    const { count: supCount } = await supabase
      .from("supporters")
      .select("id", { count: "exact", head: true })
      .eq("client_id", cId);

    return { allComments: allData, supportersCount: supCount || 0, clientId: cId };
  }, []);

  const { data: dashData, isLoading: loading } = useQuery({
    queryKey: ["dashboard-data"],
    queryFn: fetchDashboardData,
    staleTime: Infinity, // Never auto-refetch — only manual
    gcTime: 1000 * 60 * 30, // Keep in cache 30 min
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const allComments = dashData?.allComments ?? [];
  const supportersCount = dashData?.supportersCount ?? 0;

  useEffect(() => {
    if (dashData?.clientId) {
      setClientId(dashData.clientId);
    }
  }, [dashData?.clientId]);

  const reloadData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["dashboard-data"] });
  }, [queryClient]);

  // Manual sync only
  const handleManualSync = async () => {
    if (!clientId || syncing) return;
    const remaining = syncCooldownRemaining(clientId);
    if (remaining > 0) {
      toast.info(`Aguarde ${formatCooldown(remaining)} antes de sincronizar novamente (limite anti-custo).`);
      return;
    }
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-meta-comments', {
        body: { clientId, postsLimit: 30 }
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`🔄 ${data.message}`);
        setLastSync(new Date().toLocaleString("pt-BR"));
        markSyncDone(clientId);
        if (data.warnings?.length > 0) {
          for (const w of data.warnings) toast.warning(w, { duration: 8000 });
        }
        reloadData();
      } else {
        const errMsg = data?.error || "Erro na sincronização";
        if (errMsg.includes('expirado') || errMsg.includes('expired')) {
          toast.error("⚠️ Token Meta expirado! Atualize na página de Integrações.");
        } else {
          toast.error(errMsg);
        }
      }
    } catch (err: any) {
      console.error("Sync error:", err);
      toast.error("Erro ao sincronizar");
    } finally {
      setSyncing(false);
    }
  };

  // Batch sentiment analysis
  const handleAnalyzeSentiments = async (reanalyzeAll = false) => {
    if (!clientId || analyzingSentiments) return;
    setAnalyzingSentiments(true);
    try {
      const { data, error } = await supabase.functions.invoke('batch-analyze-sentiments', {
        body: { clientId, reanalyzeAll }
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(data.message);
        if (data.remaining > 0) {
          toast.info(`Restam ${data.remaining} comentários. Execute novamente para continuar.`, { duration: 8000 });
        }
        reloadData();
      } else {
        toast.error(data?.error || "Erro ao analisar sentimentos");
      }
    } catch (err: any) {
      console.error("Sentiment analysis error:", err);
      toast.error(err.message || "Erro ao analisar sentimentos");
    } finally {
      setAnalyzingSentiments(false);
    }
  };

  // Comment actions (for crisis section)
  const handleGenerateResponse = async (commentId: string, isRegenerate = false, userGuidance?: string) => {
    setGeneratingResponse(commentId);
    try {
      const body: any = { commentId, clientId };
      if (userGuidance) body.userGuidance = userGuidance;
      const { data, error } = await supabase.functions.invoke('generate-response', {
        body
      });
      if (error) throw error;
      if (data.success) {
        reloadData();
        toast.success(isRegenerate ? "Nova resposta gerada!" : "Resposta gerada!");
      } else {
        toast.error(data.error || 'Erro ao gerar resposta.');
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao gerar resposta.");
    } finally {
      setGeneratingResponse(null);
    }
  };

  const handleSendResponse = async (commentId: string, responseText: string, platform: string) => {
    if (!responseText?.trim()) { toast.error("Resposta vazia"); return; }
    setResponding(commentId);
    try {
      const { data, error } = await supabase.functions.invoke('respond-to-comment', {
        body: { commentId, clientId, responseText }
      });
      if (error) throw error;
      if (data.success) {
        reloadData();
        toast.success("Resposta publicada!");
      } else if (data.code === 'RATE_LIMITED') {
        toast.warning(data.error, { duration: 10000 });
      } else {
        toast.error(data.error || 'Falha ao publicar');
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao publicar resposta");
    } finally {
      setResponding(null);
    }
  };

  const handleManageComment = async (commentId: string, action: 'delete' | 'hide' | 'unhide' | 'block_user') => {
    setManagingComment(commentId);
    try {
      const { data, error } = await supabase.functions.invoke('manage-comment', {
        body: { commentId, clientId, action }
      });
      if (error) throw error;
      if (data.success) {
        toast.success(data.message);
        reloadData();
      } else {
        toast.error(data.error || 'Erro na operação');
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro ao gerenciar comentário');
    } finally {
      setManagingComment(null);
    }
  };

  const handleReactToComment = async (commentId: string) => {
    setReactingComment(commentId);
    try {
      const { data, error } = await supabase.functions.invoke('react-to-comment', {
        body: { commentId, clientId }
      });
      if (error) throw error;
      if (data.success) {
        toast.success("Comentário curtido! 👍");
      } else {
        toast.error(data.error || 'Erro ao curtir comentário.');
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao curtir comentário.");
    } finally {
      setReactingComment(null);
    }
  };

  // Manual sentiment reclassification
  const handleClassifySentiment = async (
    commentId: string,
    sentiment: 'positive' | 'neutral' | 'negative'
  ) => {
    setClassifyingComment(commentId);
    try {
      const { error } = await supabase
        .from('comments')
        .update({ sentiment })
        .eq('id', commentId);
      if (error) throw error;
      toast.success(
        sentiment === 'positive' ? 'Reclassificado como positivo' :
        sentiment === 'negative' ? 'Reclassificado como negativo' : 'Reclassificado como neutro'
      );
      reloadData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao reclassificar');
    } finally {
      setClassifyingComment(null);
    }
  };

  // Bulk hide selected negative comments
  const handleBulkHide = async () => {
    if (selectedCrisis.size === 0 || bulkHiding) return;
    setBulkHiding(true);
    const ids = Array.from(selectedCrisis);
    let success = 0;
    let failed = 0;
    try {
      for (const id of ids) {
        try {
          const { data, error } = await supabase.functions.invoke('manage-comment', {
            body: { commentId: id, clientId, action: 'hide' }
          });
          if (error || !data?.success) failed++;
          else success++;
        } catch {
          failed++;
        }
      }
      if (success > 0) toast.success(`${success} comentário(s) ocultado(s)`);
      if (failed > 0) toast.error(`${failed} falha(s) ao ocultar`);
      setSelectedCrisis(new Set());
      reloadData();
    } finally {
      setBulkHiding(false);
    }
  };

  const toggleCrisisSelection = (id: string) => {
    setSelectedCrisis(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllCrisis = (allIds: string[]) => {
    setSelectedCrisis(prev => {
      if (prev.size === allIds.length) return new Set();
      return new Set(allIds);
    });
  };

  const handleExportPdf = async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      // Buscar nome do cliente e IED mais recente
      let clientName: string | undefined;
      let iedData: {
        score: number;
        sentiment: number;
        growth: number;
        engagement: number;
        checkin: number;
      } | null = null;

      if (clientId) {
        const { data: client } = await supabase
          .from("clients")
          .select("name")
          .eq("id", clientId)
          .maybeSingle();
        clientName = client?.name;

        const { data: iedRow } = await supabase
          .from("ied_scores")
          .select("score, sentiment_score, growth_score, engagement_score, checkin_score")
          .eq("client_id", clientId)
          .order("week_start", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (iedRow) {
          iedData = {
            score: Number(iedRow.score) || 0,
            sentiment: Number(iedRow.sentiment_score) || 0,
            growth: Number(iedRow.growth_score) || 0,
            engagement: Number(iedRow.engagement_score) || 0,
            checkin: Number(iedRow.checkin_score) || 0,
          };
        }
      }

      // Construir insights a partir dos dados em tela
      const highlights: string[] = [];
      if (stats.total > 0) {
        highlights.push(
          `Volume: ${stats.total.toLocaleString("pt-BR")} comentários nos últimos ${periodDays} dias.`,
        );
        highlights.push(
          `Sentimento: ${stats.posPercent}% positivos, ${stats.neuPercent}% neutros, ${stats.negPercent}% negativos.`,
        );
      } else {
        highlights.push("Sem comentários no período selecionado.");
      }
      if (stats.unanalyzed > 0) {
        highlights.push(
          `${stats.unanalyzed} comentários ainda sem classificação de sentimento — rode "Analisar Sentimentos" para refinar o IED.`,
        );
      }
      if (stats.pendingCount > 0) {
        highlights.push(
          `${stats.pendingCount} comentários pendentes de resposta (${stats.respondedCount} já respondidos).`,
        );
      }
      if (negativeComments.length > 0) {
        highlights.push(
          `${negativeComments.length} comentários negativos pendentes em gestão de crise — priorize a resposta.`,
        );
      }
      if (platformStats.facebook + platformStats.instagram > 0) {
        highlights.push(
          `Distribuição por plataforma: Facebook ${platformStats.facebook} · Instagram ${platformStats.instagram}.`,
        );
      }
      if (iedData) {
        highlights.push(
          `IED atual: ${iedData.score}/100 (sentimento ${iedData.sentiment} · crescimento ${iedData.growth} · engajamento ${iedData.engagement} · check-ins ${iedData.checkin}).`,
        );
      }

      await exportDashboardPdf({
        clientName,
        periodDays,
        generatedAt: new Date(),
        stats,
        supportersCount,
        platform: platformStats,
        ied: iedData,
        highlights,
        captureSelectors: ["#dashboard-charts-grid"],
      });
      toast.success("Relatório PDF gerado");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Erro ao gerar PDF");
    } finally {
      setExportingPdf(false);
    }
  };

  // Filter comments by period
  const filteredComments = useMemo(() => {
    return allComments.filter(c => {
      const dateStr = c.comment_created_time || c.created_at;
      if (!dateStr) return false;
      const since = new Date();
      since.setDate(since.getDate() - periodDays);
      return new Date(dateStr) >= since;
    });
  }, [allComments, periodDays]);

  const stats = useMemo(() => {
    const total = filteredComments.length;
    const positive = filteredComments.filter(c => c.sentiment === "positive").length;
    const neutral = filteredComments.filter(c => c.sentiment === "neutral").length;
    const negative = filteredComments.filter(c => c.sentiment === "negative").length;
    const unanalyzed = filteredComments.filter(c => !c.sentiment).length;
    const posPercent = total > 0 ? Math.round((positive / total) * 100) : 0;
    const negPercent = total > 0 ? Math.round((negative / total) * 100) : 0;
    const neuPercent = total > 0 ? Math.round((neutral / total) * 100) : 0;
    const respondedCount = filteredComments.filter(c => c.status === "responded").length;
    const pendingCount = filteredComments.filter(c => c.status === "pending").length;
    return { total, positive, neutral, negative, unanalyzed, posPercent, negPercent, neuPercent, respondedCount, pendingCount };
  }, [filteredComments]);

  // Negative comments for crisis section
  const negativeComments = useMemo(() => {
    return filteredComments
      .filter(c => c.sentiment === "negative" && c.status !== "responded")
      .sort((a, b) => (b.comment_created_time || b.created_at || '').localeCompare(a.comment_created_time || a.created_at || ''))
      .slice(0, 20);
  }, [filteredComments]);

  // Timeline data
  const timelineData: TimelineData[] = useMemo(() => {
    const grouped: Record<string, TimelineData> = {};
    for (const c of filteredComments) {
      const dateStr = c.comment_created_time || c.created_at;
      if (!dateStr) continue;
      const date = new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      if (!grouped[date]) grouped[date] = { date, positive: 0, neutral: 0, negative: 0 };
      if (c.sentiment === "positive") grouped[date].positive++;
      if (c.sentiment === "neutral") grouped[date].neutral++;
      if (c.sentiment === "negative") grouped[date].negative++;
    }
    return Object.values(grouped);
  }, [filteredComments]);

  // Platform breakdown
  const platformStats = useMemo(() => {
    const fb = filteredComments.filter(c => c.platform === "facebook").length;
    const ig = filteredComments.filter(c => c.platform === "instagram").length;
    return { facebook: fb, instagram: ig };
  }, [filteredComments]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-muted rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Visão geral da sua presença digital. Aqui você acompanha sentimentos dos comentários, volume de interações e o desempenho geral das suas redes sociais em um único lugar.
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {stats.total.toLocaleString()} comentários • {supportersCount} apoiadores • Últimos {periodDays} dias
          </p>
          {lastSync && (
            <p className="text-xs text-muted-foreground mt-0.5">Última sincronização: {lastSync}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualSync}
            disabled={syncing}
          >
            {syncing ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Sincronizando...</>
            ) : (
              <><RefreshCw className="w-4 h-4 mr-1.5" />Sincronizar Meta</>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAnalyzeSentiments(false)}
            disabled={analyzingSentiments}
          >
            {analyzingSentiments ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Analisando...</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-1.5" />Analisar Sentimentos{stats.unanalyzed > 0 && ` (${stats.unanalyzed})`}</>
            )}
          </Button>

          <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v))}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="15">15 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="60">60 dias</SelectItem>
              <SelectItem value="90">90 dias</SelectItem>
              <SelectItem value="365">1 ano</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPdf}
            disabled={exportingPdf || loading}
            title="Gerar relatório PDF do período selecionado"
          >
            {exportingPdf ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Gerando PDF...</>
            ) : (
              <><FileDown className="w-4 h-4 mr-1.5" />Exportar PDF</>
            )}
          </Button>
        </div>
      </div>

      {/* Unanalyzed alert */}
      {stats.unanalyzed > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-warning/30 bg-warning/5">
          <AlertCircle className="w-5 h-5 text-warning shrink-0" />
          <p className="text-sm text-warning">
            <strong>{stats.unanalyzed}</strong> comentários sem análise de sentimento.
            Clique em "Analisar Sentimentos" para classificá-los automaticamente com IA.
          </p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {platformStats.facebook} FB · {platformStats.instagram} IG
            </p>
          </CardContent>
        </Card>

        <Card className="border-green-500/20 bg-green-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Positivos</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.positive}</div>
            <p className="text-[10px] text-muted-foreground mt-1">{stats.posPercent}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Neutros</CardTitle>
            <Minus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.neutral}</div>
            <p className="text-[10px] text-muted-foreground mt-1">{stats.neuPercent}%</p>
          </CardContent>
        </Card>

        <Card className="border-destructive/20 bg-destructive/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Negativos</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.negative}</div>
            <p className="text-[10px] text-muted-foreground mt-1">{stats.negPercent}%</p>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Apoiadores</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{supportersCount}</div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {stats.respondedCount} respondidos · {stats.pendingCount} pendentes
            </p>
          </CardContent>
        </Card>
      </div>

      {/* IED Panel */}
      {clientId && <IEDPanel clientId={clientId} />}

      {/* Data Health Alerts — quedas bruscas e ausência de dados */}
      {clientId && <DataHealthAlerts clientId={clientId} />}

      {/* Suggested Actions — próximos passos com links diretos */}
      {clientId && <SuggestedActions clientId={clientId} />}

      {/* Audit Panel — transparência das métricas */}
      {clientId && <AuditPanel clientId={clientId} periodDays={periodDays} />}

      {/* Alertas Widget */}
      {clientId && <AlertasWidget clientId={clientId} />}

      {/* Feriados Nacionais — apoio à agenda da campanha */}
      <FeriadosWidget />

      {/* Unified Overview */}
      {clientId && <DashboardOverview clientId={clientId} />}

      {/* Charts */}
      <div id="dashboard-charts-grid" className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Distribuição de Sentimentos</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.total === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Sem dados</p>
              </div>
            ) : (
              <ChartContainer
                config={{
                  positive: { label: "Positivos", color: "hsl(142, 71%, 45%)" },
                  neutral: { label: "Neutros", color: "hsl(var(--muted-foreground))" },
                  negative: { label: "Negativos", color: "hsl(var(--destructive))" },
                }}
                className="h-[250px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Positivos", value: stats.positive, fill: "hsl(142, 71%, 45%)" },
                        { name: "Neutros", value: stats.neutral, fill: "hsl(var(--muted-foreground))" },
                        { name: "Negativos", value: stats.negative, fill: "hsl(var(--destructive))" },
                      ]}
                      cx="50%" cy="50%" labelLine={false}
                      label={({ name, percent }) => percent > 0.02 ? `${name}: ${(percent * 100).toFixed(0)}%` : ''}
                      outerRadius={80} dataKey="value"
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Evolução no Período</CardTitle>
          </CardHeader>
          <CardContent>
            {timelineData.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Activity className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Sem dados</p>
              </div>
            ) : (
              <ChartContainer
                config={{
                  positive: { label: "Positivos", color: "hsl(142, 71%, 45%)" },
                  neutral: { label: "Neutros", color: "hsl(var(--muted-foreground))" },
                  negative: { label: "Negativos", color: "hsl(var(--destructive))" },
                }}
                className="h-[250px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Line type="monotone" dataKey="positive" stroke="hsl(142, 71%, 45%)" strokeWidth={2} name="Positivos" dot={false} />
                    <Line type="monotone" dataKey="neutral" stroke="hsl(var(--muted-foreground))" strokeWidth={2} name="Neutros" dot={false} />
                    <Line type="monotone" dataKey="negative" stroke="hsl(var(--destructive))" strokeWidth={2} name="Negativos" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Crisis Management Section */}
      <Card className="border-destructive/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              <CardTitle className="text-base">Gestão de Crise</CardTitle>
            </div>
            <Badge variant="destructive" className="text-xs">
              {negativeComments.length} negativos pendentes
            </Badge>
          </div>
          <CardDescription>
            Comentários negativos que precisam de atenção — responda, reclassifique o sentimento ou selecione vários para ocultar de uma vez
          </CardDescription>
        </CardHeader>
        <CardContent>
          {negativeComments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">Nenhum comentário negativo pendente!</p>
              <p className="text-xs mt-1">Sua reputação está protegida.</p>
            </div>
          ) : (
            <>
              {/* Bulk action bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 p-2.5 rounded-lg bg-muted/40 border border-border">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedCrisis.size === negativeComments.length && negativeComments.length > 0}
                    onCheckedChange={() => toggleAllCrisis(negativeComments.map(c => c.id))}
                    aria-label="Selecionar todos"
                  />
                  <span className="text-xs text-muted-foreground">
                    {selectedCrisis.size > 0
                      ? `${selectedCrisis.size} selecionado(s)`
                      : 'Selecionar todos'}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBulkHide}
                  disabled={selectedCrisis.size === 0 || bulkHiding}
                >
                  {bulkHiding ? (
                    <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Ocultando...</>
                  ) : (
                    <><EyeOff className="w-3.5 h-3.5 mr-1.5" />Ocultar selecionados</>
                  )}
                </Button>
              </div>

              <div className="divide-y divide-border rounded-lg border overflow-hidden">
                {negativeComments.map((comment) => (
                  <div key={comment.id} className="flex items-start gap-2 bg-background">
                    <div className="pt-4 pl-3">
                      <Checkbox
                        checked={selectedCrisis.has(comment.id)}
                        onCheckedChange={() => toggleCrisisSelection(comment.id)}
                        aria-label="Selecionar comentário"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CommentItem
                        comment={comment as CommentData}
                        onGenerateResponse={handleGenerateResponse}
                        onSendResponse={handleSendResponse}
                        onManageComment={handleManageComment}
                        onReactToComment={handleReactToComment}
                        onClassifySentiment={handleClassifySentiment}
                        isGenerating={generatingResponse === comment.id}
                        isResponding={responding === comment.id}
                        isManaging={managingComment === comment.id}
                        isReacting={reactingComment === comment.id}
                        isClassifying={classifyingComment === comment.id}
                        showPostInfo={true}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {stats.negative > negativeComments.length && (
            <p className="text-xs text-muted-foreground mt-3 text-center">
              Mostrando os {negativeComments.length} mais recentes de {stats.negative} negativos no período.
              Acesse Comentários para ver todos.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Re-analyze all button */}
      <div className="flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleAnalyzeSentiments(true)}
          disabled={analyzingSentiments}
          className="text-xs text-muted-foreground"
        >
          {analyzingSentiments ? (
            <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Reanalisando...</>
          ) : (
            <><Sparkles className="w-3 h-3 mr-1.5" />Reanalisar todos os sentimentos</>
          )}
        </Button>
      </div>
    </div>
  );
};

export default Dashboard;
