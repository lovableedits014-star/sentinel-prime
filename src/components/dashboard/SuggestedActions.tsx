import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  Sparkles, ArrowRight, Users, Crown, BookUser, MessageSquare,
  PhoneCall, AlertTriangle, UserPlus, Target, Flame, ShieldAlert,
  CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SuggestedActionsProps {
  clientId: string;
}

type Priority = "high" | "medium" | "low";

interface ActionCard {
  id: string;
  priority: Priority;
  icon: React.ElementType;
  area: "Contratados" | "Líderes" | "CRM" | "Comentários" | "Telemarketing" | "Funcionários";
  title: string;
  description: string;
  metric?: string;
  cta: string;
  to: string;
}

const PRIORITY_STYLES: Record<Priority, { dot: string; label: string; badge: string }> = {
  high:   { dot: "bg-destructive",    label: "Urgente",  badge: "bg-destructive/10 text-destructive border-destructive/30" },
  medium: { dot: "bg-amber-500",      label: "Importante", badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  low:    { dot: "bg-blue-500",       label: "Oportunidade", badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30" },
};

const AREA_COLOR: Record<ActionCard["area"], string> = {
  Contratados:   "text-primary",
  Líderes:       "text-amber-600 dark:text-amber-500",
  CRM:           "text-green-600 dark:text-green-500",
  Comentários:   "text-purple-600 dark:text-purple-400",
  Telemarketing: "text-blue-600 dark:text-blue-400",
  Funcionários:  "text-primary",
};

export function SuggestedActions({ clientId }: SuggestedActionsProps) {
  const { data: actions, isLoading } = useQuery({
    queryKey: ["suggested-actions", clientId],
    queryFn: async (): Promise<ActionCard[]> => {
      const now = new Date();
      const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
      const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(now.getDate() - 7);
      const threeDaysAgo = new Date(now); threeDaysAgo.setDate(now.getDate() - 3);

      const [
        contratadosSemContrato,
        lideresSemEquipe,
        contratadosAtivos,
        pessoasSemNivel,
        pessoasStale,
        comentariosNegPendentes,
        comentariosSemResposta,
        indicadosPendentes,
        contratadoCheckins3d,
        contratadosObrigatorios,
        funcionariosSemReferral,
      ] = await Promise.all([
        supabase.from("contratados").select("id", { count: "exact", head: true })
          .eq("client_id", clientId).eq("status", "ativo").eq("contrato_aceito", false),
        supabase.from("contratados").select("id, nome").eq("client_id", clientId)
          .eq("is_lider", true).eq("status", "ativo"),
        supabase.from("contratados").select("id", { count: "exact", head: true })
          .eq("client_id", clientId).eq("status", "ativo"),
        supabase.from("pessoas").select("id", { count: "exact", head: true })
          .eq("client_id", clientId).eq("nivel_apoio", "desconhecido"),
        supabase.from("pessoas").select("id", { count: "exact", head: true })
          .eq("client_id", clientId).lt("updated_at", thirtyDaysAgo.toISOString())
          .in("nivel_apoio", ["apoiador", "militante"]),
        supabase.from("comments").select("id", { count: "exact", head: true })
          .eq("client_id", clientId).eq("sentiment", "negative")
          .neq("status", "responded").eq("is_page_owner", false),
        supabase.from("comments").select("id", { count: "exact", head: true })
          .eq("client_id", clientId).eq("status", "pending").eq("is_page_owner", false)
          .gte("created_at", sevenDaysAgo.toISOString()),
        supabase.from("contratado_indicados").select("id", { count: "exact", head: true })
          .eq("client_id", clientId).eq("ligacao_status", "pendente"),
        supabase.from("contratado_checkins").select("id", { count: "exact", head: true })
          .eq("client_id", clientId).gte("checkin_at", threeDaysAgo.toISOString()),
        supabase.from("contratados").select("id", { count: "exact", head: true })
          .eq("client_id", clientId).eq("status", "ativo").eq("presenca_obrigatoria", true),
        supabase.from("funcionarios").select("id", { count: "exact", head: true })
          .eq("client_id", clientId).eq("status", "ativo").eq("referral_count", 0),
      ]);

      const cards: ActionCard[] = [];

      // ─── Contratados sem contrato aceito (alta prioridade) ───
      const semContrato = contratadosSemContrato.count || 0;
      if (semContrato > 0) {
        cards.push({
          id: "contratos-pendentes",
          priority: "high",
          icon: AlertTriangle,
          area: "Contratados",
          title: "Contratos pendentes de aceite",
          description: "Contratados ativos ainda não aceitaram o contrato — bloqueia portal e missões.",
          metric: `${semContrato} pendente${semContrato > 1 ? "s" : ""}`,
          cta: "Revisar contratos",
          to: "/contratados",
        });
      }

      // ─── Negativos não respondidos (alta) ───
      const negPend = comentariosNegPendentes.count || 0;
      if (negPend > 0) {
        cards.push({
          id: "negativos-pendentes",
          priority: "high",
          icon: ShieldAlert,
          area: "Comentários",
          title: "Comentários negativos sem resposta",
          description: "Atue rápido para evitar escalada de crise digital.",
          metric: `${negPend} para responder`,
          cta: "Abrir gestão de crise",
          to: "/comments?sentiment=negative&status=pending",
        });
      }

      // ─── Líderes sem equipe (alta se contratados existem) ───
      const lideres = lideresSemEquipe.data || [];
      if (lideres.length > 0) {
        const counts = await Promise.all(
          lideres.map(async (l: any) => {
            const { count } = await supabase
              .from("contratados").select("id", { count: "exact", head: true })
              .eq("client_id", clientId).eq("lider_id", l.id);
            return count || 0;
          })
        );
        const semEquipe = counts.filter(c => c === 0).length;
        if (semEquipe > 0) {
          cards.push({
            id: "lideres-sem-equipe",
            priority: "medium",
            icon: Crown,
            area: "Líderes",
            title: "Líderes sem liderados",
            description: "Vincule contratados a esses líderes para ativar a hierarquia de campo.",
            metric: `${semEquipe} líder${semEquipe > 1 ? "es" : ""} ocioso${semEquipe > 1 ? "s" : ""}`,
            cta: "Organizar equipes",
            to: "/contratados",
          });
        }
      } else if ((contratadosAtivos.count || 0) >= 3) {
        cards.push({
          id: "criar-lideres",
          priority: "medium",
          icon: Crown,
          area: "Líderes",
          title: "Você ainda não tem líderes",
          description: "Promova contratados a líderes para escalar coordenação de equipe.",
          metric: `${contratadosAtivos.count} contratado(s) ativos`,
          cta: "Promover líderes",
          to: "/contratados",
        });
      }

      // ─── Indicados pendentes para telemarketing ───
      const indPend = indicadosPendentes.count || 0;
      if (indPend >= 5) {
        cards.push({
          id: "telemarketing-fila",
          priority: indPend >= 30 ? "high" : "medium",
          icon: PhoneCall,
          area: "Telemarketing",
          title: "Fila de ligações acumulada",
          description: "Indicados aguardando contato da central de telemarketing.",
          metric: `${indPend} para ligar`,
          cta: "Trabalhar fila",
          to: "/telemarketing",
        });
      }

      // ─── CRM: pessoas sem classificação ───
      const semNivel = pessoasSemNivel.count || 0;
      if (semNivel >= 10) {
        cards.push({
          id: "classificar-pessoas",
          priority: "medium",
          icon: Target,
          area: "CRM",
          title: "Pessoas sem nível de apoio",
          description: "Classifique para identificar quem é militante, apoiador ou só simpatizante.",
          metric: `${semNivel} desconhecido${semNivel > 1 ? "s" : ""}`,
          cta: "Classificar base",
          to: "/pessoas",
        });
      }

      // ─── CRM: contatos parados ───
      const stale = pessoasStale.count || 0;
      if (stale > 0) {
        cards.push({
          id: "reativar-base",
          priority: "medium",
          icon: Flame,
          area: "CRM",
          title: "Reative apoiadores parados",
          description: "Apoiadores e militantes sem interação há 30+ dias — risco de esfriar.",
          metric: `${stale} para reaquecer`,
          cta: "Ver apoiadores",
          to: "/pessoas",
        });
      }

      // ─── Comentários pendentes (semana) ───
      const pendSemana = comentariosSemResposta.count || 0;
      if (pendSemana >= 10) {
        cards.push({
          id: "comentarios-pendentes",
          priority: "medium",
          icon: MessageSquare,
          area: "Comentários",
          title: "Comentários pendentes de moderação",
          description: "Acumulou backlog na última semana — modere para manter engajamento ativo.",
          metric: `${pendSemana} aguardando`,
          cta: "Abrir moderação",
          to: "/comments?status=pending",
        });
      }

      // ─── Check-ins ausentes ───
      const totalObrig = contratadosObrigatorios.count || 0;
      const checkins3d = contratadoCheckins3d.count || 0;
      if (totalObrig >= 5 && checkins3d / (totalObrig * 3) < 0.3) {
        cards.push({
          id: "ativar-checkins",
          priority: "medium",
          icon: CalendarCheck,
          area: "Contratados",
          title: "Cobrar check-in da equipe",
          description: "Baixa cobertura de check-ins nos últimos 3 dias — envie lembrete via WhatsApp.",
          metric: `${checkins3d}/${totalObrig * 3} esperados`,
          cta: "Ver presença",
          to: "/presenca",
        });
      }

      // ─── Funcionários sem indicações ───
      const funcZero = funcionariosSemReferral.count || 0;
      if (funcZero >= 3) {
        cards.push({
          id: "ativar-funcionarios",
          priority: "low",
          icon: UserPlus,
          area: "Funcionários",
          title: "Funcionários sem indicações",
          description: "Engaje sua equipe para começar a trazer apoiadores via link de indicação.",
          metric: `${funcZero} sem trazer ninguém`,
          cta: "Ver funcionários",
          to: "/funcionarios",
        });
      }

      // Ordena por prioridade e limita a 8 cards
      const order: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
      return cards.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 8);
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 3,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary animate-pulse" />
            <CardTitle className="text-base">Próximas Ações Sugeridas</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-muted/40 rounded-lg animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const cards = actions || [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Próximas Ações Sugeridas</CardTitle>
          </div>
          {cards.length > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {cards.length} ação{cards.length > 1 ? "ões" : ""}
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs">
          Recomendações automáticas baseadas no estado atual de Contratados, Líderes, CRM, Comentários e Telemarketing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {cards.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>Nenhuma ação prioritária no momento.</p>
            <p className="text-xs mt-1">Sua operação está em dia! 🎉</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map(card => {
              const Icon = card.icon;
              const prio = PRIORITY_STYLES[card.priority];
              return (
                <Link
                  key={card.id}
                  to={card.to}
                  className="group relative flex flex-col rounded-lg border bg-card p-4 hover:shadow-md hover:border-primary/40 transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={cn("w-1.5 h-1.5 rounded-full", prio.dot)} />
                      <span className={cn("text-[10px] font-medium uppercase tracking-wide", AREA_COLOR[card.area])}>
                        {card.area}
                      </span>
                    </div>
                    <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0", prio.badge)}>
                      {prio.label}
                    </Badge>
                  </div>

                  <div className="flex items-start gap-2 mb-2">
                    <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", AREA_COLOR[card.area])} />
                    <p className="text-sm font-semibold leading-tight">{card.title}</p>
                  </div>

                  <p className="text-xs text-muted-foreground flex-1">{card.description}</p>

                  {card.metric && (
                    <p className="text-xs font-bold mt-2 text-foreground">{card.metric}</p>
                  )}

                  <div className="flex items-center justify-end gap-1 mt-3 text-xs font-medium text-primary group-hover:gap-2 transition-all">
                    {card.cta}
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}