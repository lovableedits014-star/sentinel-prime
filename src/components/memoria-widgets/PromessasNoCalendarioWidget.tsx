import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, MapPinned, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { differenceInDays, parseISO } from "date-fns";

/**
 * Widget para o Calendário Político.
 * Mostra promessas com prazos próximos / vencidas para o usuário criar
 * conteúdo no calendário mencionando-as.
 */
export function PromessasNoCalendarioWidget({
  clientId,
  monthDate,
}: {
  clientId: string;
  monthDate: Date;
}) {
  const { data, isLoading } = useQuery({
    queryKey: [
      "memoria-promessas-calendario",
      clientId,
      monthDate.getFullYear(),
      monthDate.getMonth(),
    ],
    enabled: !!clientId,
    queryFn: async () => {
      const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
        .toISOString().slice(0, 10);
      const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
        .toISOString().slice(0, 10);

      const { data: promessas } = await supabase
        .from("ic_promessas" as any)
        .select("id, texto, bairro, prazo_data, status")
        .eq("client_id", clientId)
        .in("status", ["aberta", "em_andamento"])
        .not("prazo_data", "is", null)
        .lte("prazo_data", end)
        .order("prazo_data", { ascending: true })
        .limit(20);

      const today = new Date().toISOString().slice(0, 10);
      const all = (promessas ?? []) as any[];
      const noMes = all.filter((p) => p.prazo_data >= start && p.prazo_data <= end);
      const vencidas = all.filter((p) => p.prazo_data < today);
      return { noMes, vencidas: vencidas.slice(0, 3) };
    },
  });

  if (!clientId || isLoading) return null;
  if (!data?.noMes.length && !data?.vencidas.length) return null;

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-amber-600" />
          Promessas a comunicar
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Use o calendário para criar conteúdo sobre estas promessas antes que
          virem cobrança pública.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.vencidas.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-medium flex items-center gap-1.5 text-destructive">
              <AlertTriangle className="w-3 h-3" /> Vencidas
            </div>
            {data.vencidas.map((p) => {
              const dias = differenceInDays(new Date(), parseISO(p.prazo_data));
              return (
                <div key={p.id} className="text-xs flex items-start gap-2 p-2 rounded bg-destructive/5">
                  <Badge variant="destructive" className="text-[10px] shrink-0">
                    -{dias}d
                  </Badge>
                  <span className="flex-1">
                    {p.texto.length > 70 ? p.texto.slice(0, 67) + "…" : p.texto}
                    {p.bairro && (
                      <span className="ml-1 text-muted-foreground inline-flex items-center gap-0.5">
                        <MapPinned className="w-2.5 h-2.5" />{p.bairro}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {data.noMes.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">
              Vencendo este mês ({data.noMes.length})
            </div>
            {data.noMes.slice(0, 4).map((p) => (
              <div key={p.id} className="text-xs flex items-start gap-2">
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {p.prazo_data.slice(8, 10)}/{p.prazo_data.slice(5, 7)}
                </Badge>
                <span className="flex-1">
                  {p.texto.length > 70 ? p.texto.slice(0, 67) + "…" : p.texto}
                  {p.bairro && (
                    <span className="ml-1 text-muted-foreground inline-flex items-center gap-0.5">
                      <MapPinned className="w-2.5 h-2.5" />{p.bairro}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        <Link to="/inteligencia-conteudo" className="block">
          <Button variant="ghost" size="sm" className="w-full h-7 text-xs">
            Gerenciar promessas →
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
