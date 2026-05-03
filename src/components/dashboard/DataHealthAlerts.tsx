import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  HeartPulse, AlertTriangle, AlertCircle, CheckCircle2, TrendingDown,
  CalendarX, MessageSquareOff, Sparkles, ArrowRight, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DataHealthAlertsProps {
  clientId: string;
}

type Severity = "critical" | "warning" | "info" | "ok";

interface HealthAlert {
  id: string;
  severity: Severity;
  icon: React.ElementType;
  title: string;
  description: string;
  detail?: string;
  link?: { to: string; label: string };
}

const SEV_STYLES: Record<Severity, { card: string; badge: string; iconColor: string; label: string }> = {
  critical: {
    card: "border-destructive/50 bg-destructive/5",
    badge: "bg-destructive text-destructive-foreground",
    iconColor: "text-destructive",
    label: "Crítico",
  },
  warning: {
    card: "border-amber-500/50 bg-amber-500/5",
    badge: "bg-amber-500 text-white",
    iconColor: "text-amber-600 dark:text-amber-500",
    label: "Atenção",
  },
  info: {
    card: "border-blue-500/40 bg-blue-500/5",
    badge: "bg-blue-500 text-white",
    iconColor: "text-blue-600 dark:text-blue-400",
    label: "Info",
  },
  ok: {
    card: "border-green-500/40 bg-green-500/5",
    badge: "bg-green-600 text-white",
    iconColor: "text-green-600 dark:text-green-500",
    label: "OK",
  },
};

export function DataHealthAlerts({ clientId }: DataHealthAlertsProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["data-health-alerts", clientId],
    queryFn: async (): Promise<HealthAlert[]> => {
      const now = new Date();
      const today = now.toISOString().split("T")[0];

      // Janelas de tempo
      const last7 = new Date(now); last7.setDate(now.getDate() - 7);
      const prev7 = new Date(now); prev7.setDate(now.getDate() - 14);
      const last3Days = new Date(now); last3Days.setDate(now.getDate() - 3);
      const last24h = new Date(now); last24h.setHours(now.getHours() - 24);
      const last48h = new Date(now); last48h.setHours(now.getHours() - 48);
      const last7dStart = last7.toISOString();
      const prev7dStart = prev7.toISOString();

      const [
        contratadosObrigatorios,
        funcionariosObrigatorios,
        contratadoCheckins3d,
        funcionarioCheckins3d,
        pessoasNovas7d,
        pessoasNovasPrev7d,
        comentariosUltimos24h,
        comentariosUltimos48h,
        sentimentoUltimo,
        comentariosSemSentimento,
        contratadoUltimoCheckin,
        funcionarioUltimoCheckin,
        pessoasUltimoCadastro,
        comentariosUltimo,
      ] = await Promise.all([
        supabase.from("contratados").select("id", { count: "exact", head: true })
          .eq("client_id", clientId).eq("status", "ativo").eq("presenca_obrigatoria", true),
        supabase.from("funcionarios").select("id", { count: "exact", head: true })
          .eq("client_id", clientId).eq("status", "ativo").eq("presenca_obrigatoria", true),
        supabase.from("contratado_checkins").select("id", { count: "exact", head: true })
          .eq("client_id", clientId).gte("checkin_at", last3Days.toISOString()),
        supabase.from("funcionario_checkins").select("id", { count: "exact", head: true })
          .eq("client_id", clientId).gte("checkin_at", last3Days.toISOString()),
        supabase.from("pessoas").select("id", { count: "exact", head: true })
          .eq("client_id", clientId).gte("created_at", last7dStart),
        supabase.from("pessoas").select("id", { count: "exact", head: true })
          .eq("client_id", clientId).gte("created_at", prev7dStart).lt("created_at", last7dStart),
        supabase.from("comments").select("id", { count: "exact", head: true })
          .eq("client_id", clientId).gte("created_at", last24h.toISOString()),
        supabase.from("comments").select("id", { count: "exact", head: true })
          .eq("client_id", clientId).gte("created_at", last48h.toISOString()),
        supabase.from("comments").select("created_at").eq("client_id", clientId)
          .not("sentiment", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("comments").select("id", { count: "exact", head: true })
          .eq("client_id", clientId).is("sentiment", null).eq("is_page_owner", false),
        supabase.from("contratado_checkins").select("checkin_at").eq("client_id", clientId)
          .order("checkin_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("funcionario_checkins").select("checkin_at").eq("client_id", clientId)
          .order("checkin_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("pessoas").select("created_at").eq("client_id", clientId)
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("comments").select("created_at").eq("client_id", clientId)
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      const alerts: HealthAlert[] = [];

      const totalObrig = (contratadosObrigatorios.count || 0) + (funcionariosObrigatorios.count || 0);
      const totalCheckins3d = (contratadoCheckins3d.count || 0) + (funcionarioCheckins3d.count || 0);

      // 1) Check-ins ausentes nos últimos 3 dias
      if (totalObrig > 0 && totalCheckins3d === 0) {
        alerts.push({
          id: "no-checkins-3d",
          severity: "critical",
          icon: CalendarX,
          title: "Nenhum check-in nos últimos 3 dias",
          description: `Você tem ${totalObrig} pessoa(s) com presença obrigatória, mas ninguém registrou presença em 72h.`,
          detail: "Verifique se o portal está acessível e envie um lembrete.",
          link: { to: "/controle-presenca", label: "Ver controle de presença" },
        });
      } else if (totalObrig > 0) {
        // Cobertura baixa (<25% em 3 dias = média < ~8%/dia)
        const expected = totalObrig * 3;
        const coverage = expected > 0 ? totalCheckins3d / expected : 0;
        if (coverage < 0.25) {
          alerts.push({
            id: "low-checkin-coverage",
            severity: "warning",
            icon: TrendingDown,
            title: "Cobertura de check-ins baixa",
            description: `Apenas ${Math.round(coverage * 100)}% dos check-ins esperados nos últimos 3 dias (${totalCheckins3d} de ~${expected}).`,
            link: { to: "/controle-presenca", label: "Investigar" },
          });
        }
      }

      // 2) Crescimento da base — queda brusca semana sobre semana
      const novas7 = pessoasNovas7d.count || 0;
      const novasPrev = pessoasNovasPrev7d.count || 0;
      if (novasPrev >= 5 && novas7 === 0) {
        alerts.push({
          id: "growth-collapsed",
          severity: "critical",
          icon: TrendingDown,
          title: "Cadastros pararam totalmente",
          description: `Semana anterior teve ${novasPrev} cadastros, esta semana ainda está em zero.`,
          link: { to: "/pessoas", label: "Abrir CRM" },
        });
      } else if (novasPrev >= 10 && novas7 > 0) {
        const drop = (novasPrev - novas7) / novasPrev;
        if (drop >= 0.5) {
          alerts.push({
            id: "growth-drop",
            severity: "warning",
            icon: TrendingDown,
            title: `Queda de ${Math.round(drop * 100)}% nos cadastros`,
            description: `Esta semana: ${novas7} cadastros · semana anterior: ${novasPrev}.`,
            link: { to: "/pessoas", label: "Abrir CRM" },
          });
        }
      } else if (novas7 === 0 && novasPrev === 0) {
        // Nada de cadastro há 14 dias inteiros
        const ultimoPessoa = pessoasUltimoCadastro.data?.created_at;
        if (ultimoPessoa) {
          const days = Math.floor((now.getTime() - new Date(ultimoPessoa).getTime()) / 86400000);
          if (days >= 14) {
            alerts.push({
              id: "no-growth-14d",
              severity: "warning",
              icon: CalendarX,
              title: "Nenhum cadastro há 14+ dias",
              description: `Último cadastro foi há ${days} dias.`,
              link: { to: "/pessoas", label: "Cadastrar pessoa" },
            });
          }
        }
      }

      // 3) Sentimento sem atualização
      const ultimoSentimento = sentimentoUltimo.data?.created_at;
      if (ultimoSentimento) {
        const horasDesde = (now.getTime() - new Date(ultimoSentimento).getTime()) / 3600000;
        if (horasDesde >= 72) {
          alerts.push({
            id: "sentiment-stale",
            severity: "warning",
            icon: Sparkles,
            title: "Sentimento desatualizado há 3+ dias",
            description: `Última análise foi há ${Math.round(horasDesde / 24)} dias.`,
            detail: "Rode 'Analisar Sentimentos' no topo do dashboard.",
          });
        }
      }

      const semSentimento = comentariosSemSentimento.count || 0;
      const ultimoComentario = comentariosUltimo.data?.created_at;
      if (semSentimento >= 50 && ultimoComentario) {
        alerts.push({
          id: "sentiment-backlog",
          severity: "info",
          icon: Sparkles,
          title: `${semSentimento} comentários sem análise`,
          description: "Há um backlog grande de comentários esperando classificação.",
          detail: "Use o botão 'Analisar Sentimentos' para processar em lote.",
        });
      }

      // 4) Coleta de comentários parada
      const com24h = comentariosUltimos24h.count || 0;
      const com48h = comentariosUltimos48h.count || 0;
      if (ultimoComentario) {
        const horasDesde = (now.getTime() - new Date(ultimoComentario).getTime()) / 3600000;
        if (horasDesde >= 48) {
          alerts.push({
            id: "no-comments-48h",
            severity: "critical",
            icon: MessageSquareOff,
            title: "Sem novos comentários há 48h+",
            description: `Último comentário coletado foi há ${Math.round(horasDesde)}h. A integração Meta pode estar com problema.`,
            link: { to: "/integracoes", label: "Verificar integração" },
          });
        } else if (com48h > 0 && com24h === 0 && com48h >= 5) {
          alerts.push({
            id: "comments-stopped",
            severity: "warning",
            icon: MessageSquareOff,
            title: "Coleta de comentários parou",
            description: `Ontem entraram ${com48h - com24h} comentários, hoje zero. Sincronize manualmente.`,
          });
        }
      }

      // 5) Última sincronização Meta — proxy via último comentário criado no DB
      // (já coberto pelo item acima)

      return alerts;
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 3, // 3 min
    refetchInterval: 1000 * 60 * 5, // refresca a cada 5 min em background
  });

  const alerts = data || [];
  const critical = alerts.filter(a => a.severity === "critical").length;
  const warning = alerts.filter(a => a.severity === "warning").length;

  return (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <HeartPulse className={cn(
              "w-5 h-5",
              critical > 0 ? "text-destructive animate-pulse"
                : warning > 0 ? "text-amber-500"
                : "text-green-600"
            )} />
            <CardTitle className="text-base">Saúde dos Dados</CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            {critical > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {critical} crítico{critical > 1 ? "s" : ""}
              </Badge>
            )}
            {warning > 0 && (
              <Badge className="bg-amber-500 text-white hover:bg-amber-500/90 text-[10px]">
                {warning} atenção
              </Badge>
            )}
            {alerts.length === 0 && !isLoading && (
              <Badge className="bg-green-600 text-white hover:bg-green-600/90 text-[10px]">
                Tudo OK
              </Badge>
            )}
          </div>
        </div>
        <CardDescription className="text-xs">
          Monitora quedas bruscas e ausência de dados em check-ins, cadastros, sentimento e coleta de comentários. Atualiza a cada 5 min.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Clock className="w-4 h-4 animate-spin" />
            Verificando saúde dos dados...
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex items-center gap-3 py-4 text-sm">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            <div>
              <p className="font-medium">Nenhuma anomalia detectada</p>
              <p className="text-xs text-muted-foreground">
                Check-ins, cadastros, sentimento e coleta de comentários estão dentro do esperado.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-2">
            {alerts.map(alert => {
              const styles = SEV_STYLES[alert.severity];
              const Icon = alert.icon;
              return (
                <div
                  key={alert.id}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3",
                    styles.card
                  )}
                >
                  <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", styles.iconColor)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{alert.title}</p>
                      <Badge className={cn("text-[9px] px-1.5 py-0", styles.badge)}>
                        {styles.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{alert.description}</p>
                    {alert.detail && (
                      <p className="text-[11px] text-muted-foreground/80 mt-1 italic">
                        💡 {alert.detail}
                      </p>
                    )}
                    {alert.link && (
                      <Button asChild variant="link" size="sm" className="h-auto p-0 mt-1 text-xs">
                        <Link to={alert.link.to}>
                          {alert.link.label} <ArrowRight className="w-3 h-3 ml-1" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}