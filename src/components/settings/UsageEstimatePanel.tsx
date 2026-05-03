import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Activity,
  AlertTriangle,
  Brain,
  ExternalLink,
  Database,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
  TrendingUp,
} from "lucide-react";

// ─── Preços de referência (estimativa) ───
// Lovable Cloud: $25 grátis/mês; Lovable AI: $1 grátis/mês.
// Valores médios usados como aproximação — o número real está no painel oficial.
const FREE_CLOUD_USD = 25;
const FREE_AI_USD = 1;

// AI Gateway — custo médio por chamada (gemini-2.5-flash, prompt curto/médio)
const AI_COST_PER_CALL_USD = 0.0008; // ~0,08 ¢ por chamada

// Cloud — custo aproximado por categoria de uso interno
const CLOUD_COSTS = {
  // Cada invocação de Edge Function (WhatsApp, Meta sync, push, etc.)
  edgeInvocationUsd: 0.000002,        // ~$2 / 1M execuções
  // Mensagens WhatsApp (cada disparo aciona function + bridge call)
  whatsappDispatchUsd: 0.00005,
  // Comentários sincronizados (escrita + leitura)
  commentRowUsd: 0.00002,
  // Push notifications enviadas
  pushNotificationUsd: 0.00003,
  // Custo base de instância pequena (proporcional aos dias do mês)
  monthlyBaseUsd: 8,                  // instância padrão
};

interface MonthMetrics {
  whatsappDispatches: number;
  comments: number;
  pushSent: number;
  iaActions: number;
  totalRows: number;
}

const SETTINGS_URL = "https://lovable.dev/projects/6fdd5ff8-e832-4337-8ae1-e24a944a0129/settings/cloud";

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
}

function daysIntoMonth(date = new Date()) {
  return date.getDate();
}

function daysInMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function fmtUsd(v: number) {
  return `$${v.toFixed(2)}`;
}

export default function UsageEstimatePanel({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<MonthMetrics | null>(null);

  const loadMetrics = async () => {
    setRefreshing(true);
    const since = startOfMonth();

    const [whats, comm, push, ia] = await Promise.all([
      // Mensagens WhatsApp enviadas no mês
      supabase
        .from("dispatch_items")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("sent_at", since),

      // Comentários sincronizados no mês (cliente)
      supabase
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .gte("created_at", since),

      // Push notifications disparadas no mês
      supabase
        .from("push_dispatch_jobs")
        .select("sent_count")
        .eq("client_id", clientId)
        .gte("created_at", since),

      // Ações com IA (sentimento, missões IA, crise) — via action_logs
      supabase
        .from("action_logs")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .gte("created_at", since)
        .in("action", [
          "analyze_sentiment",
          "batch_analyze_sentiments",
          "suggest_missions",
          "analyze_crisis",
          "generate_response",
        ]),
    ]);

    const pushSent = (push.data || []).reduce(
      (acc: number, row: any) => acc + (row.sent_count || 0),
      0,
    );

    setMetrics({
      whatsappDispatches: whats.count || 0,
      comments: comm.count || 0,
      pushSent,
      iaActions: ia.count || 0,
      totalRows: (whats.count || 0) + (comm.count || 0) + pushSent + (ia.count || 0),
    });

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    if (clientId) loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const estimate = useMemo(() => {
    if (!metrics) return null;

    // Custo Cloud até agora (mês corrente)
    const cloudVar =
      metrics.whatsappDispatches * CLOUD_COSTS.whatsappDispatchUsd +
      metrics.comments * CLOUD_COSTS.commentRowUsd +
      metrics.pushSent * CLOUD_COSTS.pushNotificationUsd +
      metrics.iaActions * CLOUD_COSTS.edgeInvocationUsd * 50; // IA chama várias funções

    const elapsedDays = daysIntoMonth();
    const totalDays = daysInMonth();
    const baseProrated = (CLOUD_COSTS.monthlyBaseUsd * elapsedDays) / totalDays;
    const cloudUsed = baseProrated + cloudVar;

    // Projeção fim do mês (linear)
    const dailyAvg = cloudUsed / Math.max(elapsedDays, 1);
    const cloudProjected = dailyAvg * totalDays;

    // IA
    const aiUsed = metrics.iaActions * AI_COST_PER_CALL_USD;
    const aiProjected = (aiUsed / Math.max(elapsedDays, 1)) * totalDays;

    const cloudPct = Math.min(100, (cloudUsed / FREE_CLOUD_USD) * 100);
    const aiPct = Math.min(100, (aiUsed / FREE_AI_USD) * 100);
    const cloudProjPct = (cloudProjected / FREE_CLOUD_USD) * 100;
    const aiProjPct = (aiProjected / FREE_AI_USD) * 100;

    return {
      cloudUsed,
      cloudProjected,
      cloudPct,
      cloudProjPct,
      aiUsed,
      aiProjected,
      aiPct,
      aiProjPct,
      elapsedDays,
      totalDays,
    };
  }, [metrics]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" /> Consumo estimado
          </CardTitle>
          <CardDescription>Calculando…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const willOverflowCloud = (estimate?.cloudProjPct ?? 0) > 100;
  const willOverflowAi = (estimate?.aiProjPct ?? 0) > 100;
  const cloudRemaining = Math.max(0, FREE_CLOUD_USD - (estimate?.cloudUsed ?? 0));
  const lowCloudBalance = !willOverflowCloud && cloudRemaining > 0 && cloudRemaining < 5;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" /> Consumo estimado do mês
            </CardTitle>
            <CardDescription className="mt-1">
              Estimativa interna baseada na atividade do seu sistema. Para o número oficial, abra o painel da Lovable.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadMetrics} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" asChild>
              <a href={SETTINGS_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" /> Ver consumo real
              </a>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {(willOverflowCloud || willOverflowAi) && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Atenção — projeção acima do saldo grátis</AlertTitle>
            <AlertDescription>
              No ritmo atual,{" "}
              {willOverflowCloud && (
                <>o <strong>Cloud</strong> deve fechar o mês em {fmtUsd(estimate!.cloudProjected)} (saldo grátis: {fmtUsd(FREE_CLOUD_USD)}).</>
              )}
              {willOverflowCloud && willOverflowAi && " "}
              {willOverflowAi && (
                <>A <strong>IA</strong> deve fechar em {fmtUsd(estimate!.aiProjected)} (saldo grátis: {fmtUsd(FREE_AI_USD)}).</>
              )}{" "}
              Considere adicionar saldo no painel da Lovable para evitar interrupção.
            </AlertDescription>
          </Alert>
        )}

        {lowCloudBalance && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Saldo Cloud baixo — restam {fmtUsd(cloudRemaining)}</AlertTitle>
            <AlertDescription>
              Você está perto de esgotar o saldo grátis do mês. Para evitar pausas no sistema,{" "}
              <a href={SETTINGS_URL} target="_blank" rel="noopener noreferrer" className="underline font-medium">
                adicione saldo agora
              </a>{" "}
              em Settings → Cloud &amp; AI balance (requer plano Pro ou superior).
            </AlertDescription>
          </Alert>
        )}

        <Alert className="bg-muted/40">
          <Sparkles className="h-4 w-4" />
          <AlertTitle>Otimizações ativas</AlertTitle>
          <AlertDescription className="text-xs">
            Limpeza automática diária de dados antigos (comentários &gt;180d, logs &gt;90d), throttle de 5 min na sincronização Meta e crons internos com frequência reduzida. Estas otimizações cortam ~30–40% do consumo Cloud.
          </AlertDescription>
        </Alert>

        {/* Lovable Cloud */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <span className="font-medium">Lovable Cloud</span>
              <Badge variant="outline" className="text-xs">
                Saldo grátis: {fmtUsd(FREE_CLOUD_USD)}/mês
              </Badge>
            </div>
            <span className="text-sm font-mono">
              {fmtUsd(estimate!.cloudUsed)} / {fmtUsd(FREE_CLOUD_USD)}
            </span>
          </div>
          <Progress value={estimate!.cloudPct} className="h-2" />
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            Projeção fim do mês: <strong className={willOverflowCloud ? "text-destructive" : ""}>{fmtUsd(estimate!.cloudProjected)}</strong>
            {" · "}
            {estimate!.elapsedDays}/{estimate!.totalDays} dias decorridos
          </div>
        </div>

        {/* Lovable AI */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-medium">Lovable AI (IA)</span>
              <Badge variant="outline" className="text-xs">
                Saldo grátis: {fmtUsd(FREE_AI_USD)}/mês
              </Badge>
            </div>
            <span className="text-sm font-mono">
              {fmtUsd(estimate!.aiUsed)} / {fmtUsd(FREE_AI_USD)}
            </span>
          </div>
          <Progress value={estimate!.aiPct} className="h-2" />
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            Projeção fim do mês: <strong className={willOverflowAi ? "text-destructive" : ""}>{fmtUsd(estimate!.aiProjected)}</strong>
          </div>
        </div>

        {/* Detalhamento dos drivers */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t">
          <DriverCard
            icon={<Send className="h-4 w-4" />}
            label="Mensagens WhatsApp"
            value={metrics!.whatsappDispatches}
          />
          <DriverCard
            icon={<MessageSquare className="h-4 w-4" />}
            label="Comentários sincronizados"
            value={metrics!.comments}
          />
          <DriverCard
            icon={<Brain className="h-4 w-4" />}
            label="Análises de IA"
            value={metrics!.iaActions}
          />
          <DriverCard
            icon={<Activity className="h-4 w-4" />}
            label="Push notifications"
            value={metrics!.pushSent}
          />
        </div>

        <p className="text-xs text-muted-foreground pt-2 border-t">
          ⚠️ Esta é uma <strong>estimativa interna</strong> com preços de referência. O valor real pode variar conforme tamanho da instância, transferência de dados e outros fatores. Sempre confira o painel oficial antes de decisões de upgrade.
          <br />
          ℹ️ <strong>Sobre o crédito grátis:</strong> $25 Cloud + $1 AI por workspace todo mês (renovação mensal automática), confirmado pela Lovable até <strong>início de 2026</strong>. Após essa data, será descontinuado e o consumo passa a ser inteiramente pago.
        </p>
      </CardContent>
    </Card>
  );
}

function DriverCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3 bg-muted/30">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value.toLocaleString("pt-BR")}</div>
      <div className="text-xs text-muted-foreground">no mês atual</div>
    </div>
  );
}