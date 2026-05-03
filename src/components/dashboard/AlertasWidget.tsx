import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, ShieldAlert, TrendingDown, MessageSquareWarning, Clock, BellOff, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";

type Alerta = {
  id: string;
  tipo: string;
  severidade: string;
  titulo: string;
  lido: boolean;
  created_at: string;
};

const TIPO_ICONS: Record<string, any> = {
  crise: ShieldAlert,
  sentimento_negativo: MessageSquareWarning,
  queda_engajamento: TrendingDown,
  tarefa_atrasada: Clock,
  inatividade: BellOff,
};

const TIPO_COLORS: Record<string, string> = {
  crise: "text-red-500",
  sentimento_negativo: "text-orange-500",
  queda_engajamento: "text-amber-500",
  tarefa_atrasada: "text-blue-500",
  inatividade: "text-slate-500",
};

export const AlertasWidget = ({ clientId }: { clientId: string }) => {
  const [alertas, setAlertas] = useState<Alerta[]>([]);

  useEffect(() => {
    if (!clientId) return;
    supabase
      .from("alertas")
      .select("id, tipo, severidade, titulo, lido, created_at")
      .eq("client_id", clientId)
      .eq("descartado", false)
      .eq("lido", false)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (data) setAlertas(data as Alerta[]);
      });
  }, [clientId]);

  if (alertas.length === 0) return null;

  return (
    <Card className="border-primary/20">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            Alertas Recentes
            <Badge variant="destructive" className="text-[10px]">{alertas.length}</Badge>
          </h3>
          <Link to="/alertas">
            <Button variant="ghost" size="sm" className="gap-1 text-xs">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
        <div className="space-y-2">
          {alertas.map(a => {
            const Icon = TIPO_ICONS[a.tipo] || Bell;
            const color = TIPO_COLORS[a.tipo] || "text-muted-foreground";
            return (
              <div key={a.id} className="flex items-center gap-2 text-sm">
                <Icon className={`w-4 h-4 shrink-0 ${color}`} />
                <span className="flex-1 truncate text-foreground">{a.titulo}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
