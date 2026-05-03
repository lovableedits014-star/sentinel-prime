import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Area, AreaChart } from "recharts";
import {
  Loader2, RefreshCw, TrendingUp, TrendingDown, Minus,
  Heart, Users, Activity, CalendarCheck, Gauge,
} from "lucide-react";
import { toast } from "sonner";

interface IEDPanelProps {
  clientId: string;
}

interface IEDData {
  current: {
    score: number;
    sentiment_score: number;
    growth_score: number;
    engagement_score: number;
    checkin_score: number;
    details: any;
  };
  history: Array<{
    week_start: string;
    score: number;
    sentiment_score: number;
    growth_score: number;
    engagement_score: number;
    checkin_score: number;
  }>;
}

const getScoreColor = (score: number) => {
  if (score >= 70) return "text-green-500";
  if (score >= 40) return "text-yellow-500";
  return "text-destructive";
};

const getScoreLabel = (score: number) => {
  if (score >= 80) return "Excelente";
  if (score >= 60) return "Bom";
  if (score >= 40) return "Regular";
  if (score >= 20) return "Atenção";
  return "Crítico";
};

const getScoreBadgeVariant = (score: number): "default" | "secondary" | "destructive" => {
  if (score >= 60) return "default";
  if (score >= 40) return "secondary";
  return "destructive";
};

const getProgressColor = (score: number) => {
  if (score >= 70) return "bg-green-500";
  if (score >= 40) return "bg-yellow-500";
  return "bg-destructive";
};

const ScoreRing = ({ score, size = 140 }: { score: number; size?: number }) => {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const strokeColor = score >= 70 ? "hsl(142, 76%, 36%)" : score >= 40 ? "hsl(38, 92%, 50%)" : "hsl(0, 84%, 60%)";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="hsl(var(--muted))" strokeWidth="8"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={strokeColor} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold ${getScoreColor(score)}`}>{score}</span>
        <span className="text-[10px] text-muted-foreground font-medium">/100</span>
      </div>
    </div>
  );
};

const ComponentBar = ({ label, description, score, icon: Icon }: { label: string; description: string; score: number; icon: any }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        <span>{label}</span>
      </div>
      <span className={`font-semibold ${getScoreColor(score)}`}>{score}</span>
    </div>
    <p className="text-[11px] text-muted-foreground/70 leading-tight">{description}</p>
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ease-out ${getProgressColor(score)}`}
        style={{ width: `${score}%` }}
      />
    </div>
  </div>
);

export const IEDPanel = ({ clientId }: IEDPanelProps) => {
  const [calculating, setCalculating] = useState(false);
  const autoCalcTriedRef = useRef(false);

  const { data, isLoading, refetch } = useQuery<IEDData>({
    queryKey: ["ied-score", clientId],
    queryFn: async () => {
      // Try to fetch existing scores first
      const { data: existing } = await supabase
        .from("ied_scores")
        .select("*")
        .eq("client_id", clientId)
        .order("week_start", { ascending: true })
        .limit(12);

      if (existing && existing.length > 0) {
        const latest = existing[existing.length - 1];
        return {
          current: {
            score: latest.score,
            sentiment_score: latest.sentiment_score,
            growth_score: latest.growth_score,
            engagement_score: latest.engagement_score,
            checkin_score: latest.checkin_score,
            details: latest.details,
          },
          history: existing as any[],
        };
      }
      return null as any;
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 5,
  });

  const handleCalculate = async () => {
    if (calculating) return;
    setCalculating(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("calculate-ied", {
        body: { clientId },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      toast.success("IED calculado com sucesso!");
      refetch();
    } catch (err: any) {
      console.error("IED calc error:", err);
      toast.error(err.message || "Erro ao calcular IED");
    } finally {
      setCalculating(false);
    }
  };

  // Auto-recálculo: se não há score OU o último é antigo (>24h), calcular silenciosamente
  useEffect(() => {
    if (!clientId || isLoading || calculating || autoCalcTriedRef.current) return;
    const history = data?.history || [];
    const latest = history[history.length - 1];
    const needsCalc =
      !latest ||
      (latest.week_start &&
        Date.now() - new Date(latest.week_start as any).getTime() > 24 * 60 * 60 * 1000);
    if (needsCalc) {
      autoCalcTriedRef.current = true;
      (async () => {
        try {
          await supabase.functions.invoke("calculate-ied", { body: { clientId } });
          refetch();
        } catch (e) {
          console.warn("Auto IED calc failed:", e);
        }
      })();
    }
  }, [clientId, data, isLoading, calculating, refetch]);

  const current = data?.current;
  const history = data?.history || [];

  const chartData = history.map(h => ({
    week: new Date(h.week_start).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    score: h.score,
    sentiment: h.sentiment_score,
    growth: h.growth_score,
    engagement: h.engagement_score,
    checkin: h.checkin_score,
  }));

  // Trend
  const trend = history.length >= 2
    ? history[history.length - 1].score - history[history.length - 2].score
    : 0;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Índice de Eleitorabilidade Digital</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCalculate}
            disabled={calculating}
          >
            {calculating ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Calculando...</>
            ) : (
              <><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Atualizar IED</>
            )}
          </Button>
        </div>
        <CardDescription>
          Score combinado de sentimento, crescimento, engajamento e presença
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !current ? (
          <div className="text-center py-8">
            <Gauge className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground mb-3">Nenhum IED calculado ainda</p>
            <Button size="sm" onClick={handleCalculate} disabled={calculating}>
              {calculating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Gauge className="w-4 h-4 mr-1.5" />}
              Calcular Agora
            </Button>
          </div>
        ) : (
          <>
            {/* Score + Components */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Main Score */}
              <div className="flex flex-col items-center gap-3">
                <ScoreRing score={current.score} />
                <div className="flex items-center gap-2">
                  <Badge variant={getScoreBadgeVariant(current.score)}>
                    {getScoreLabel(current.score)}
                  </Badge>
                  {trend !== 0 && (
                    <Badge variant="secondary" className="gap-1">
                      {trend > 0 ? <TrendingUp className="w-3 h-3 text-green-500" /> : <TrendingDown className="w-3 h-3 text-destructive" />}
                      {trend > 0 ? "+" : ""}{trend} pts
                    </Badge>
                  )}
                </div>
              </div>

              {/* Component Breakdown */}
              <div className="space-y-4">
                <ComponentBar label="Sentimento" description="Análise dos comentários positivos, neutros e negativos nas redes sociais" score={current.sentiment_score} icon={Heart} />
                <ComponentBar label="Crescimento" description="Ritmo de entrada de novos apoiadores na base nos últimos 30 dias" score={current.growth_score} icon={Users} />
                <ComponentBar label="Engajamento" description="Nível de interação dos apoiadores com curtidas, comentários e compartilhamentos" score={current.engagement_score} icon={Activity} />
                <ComponentBar label="Presenças" description="Frequência de check-ins dos apoiadores no portal nos últimos 7 dias" score={current.checkin_score} icon={CalendarCheck} />
              </div>
            </div>

            {/* Weekly Evolution Chart */}
            {chartData.length > 1 && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Evolução Semanal</h4>
                <ChartContainer
                  config={{
                    score: { label: "IED", color: "hsl(var(--primary))" },
                  }}
                  className="h-[200px]"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="iedGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area
                        type="monotone" dataKey="score" name="IED"
                        stroke="hsl(var(--primary))" strokeWidth={2.5}
                        fill="url(#iedGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
