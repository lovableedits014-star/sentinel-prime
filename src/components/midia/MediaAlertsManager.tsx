import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, ExternalLink, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Gestor simples de alertas de mídia (eventos disparados a partir de buscas salvas).
 * Lista os últimos eventos e permite marcá-los como lidos.
 */
export default function MediaAlertsManager({ clientId }: { clientId: string | null }) {
  const qc = useQueryClient();

  const { data: events, isLoading } = useQuery({
    queryKey: ["media-alert-events", clientId],
    enabled: !!clientId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_alert_events")
        .select("id, title, url, domain, tone, seendate, is_read, created_at, search_id")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("media_alert_events").update({ is_read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media-alert-events", clientId] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("media_alert_events")
        .update({ is_read: true })
        .eq("client_id", clientId!)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Todos os alertas marcados como lidos");
      qc.invalidateQueries({ queryKey: ["media-alert-events", clientId] });
      qc.invalidateQueries({ queryKey: ["media-alert-unread", clientId] });
    },
  });

  if (!clientId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          Cliente não identificado.
        </CardContent>
      </Card>
    );
  }

  const unread = (events || []).filter((e: any) => !e.is_read).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" /> Alertas de Mídia
            </CardTitle>
            <CardDescription>
              Eventos gerados pelas suas buscas salvas. {unread > 0 && <Badge variant="destructive" className="ml-1">{unread} novos</Badge>}
            </CardDescription>
          </div>
          {unread > 0 && (
            <Button size="sm" variant="outline" onClick={() => markAllRead.mutate()}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Marcar todos como lidos
            </Button>
          )}
        </CardHeader>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : !events || events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BellOff className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum alerta ainda.</p>
            <p className="text-xs mt-2">Crie e salve uma busca na aba "Mídia" para começar a receber alertas.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {events.map((e: any) => (
            <Card key={e.id} className={e.is_read ? "opacity-60" : "border-primary/40"}>
              <CardContent className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium line-clamp-2">{e.title || "(sem título)"}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {e.domain} · {new Date(e.created_at).toLocaleString("pt-BR")}
                      {e.tone != null && (
                        <Badge variant="outline" className="ml-2 text-[10px]">tom {Number(e.tone).toFixed(1)}</Badge>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {e.url && (
                      <a href={e.url} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </a>
                    )}
                    {!e.is_read && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => markRead.mutate(e.id)}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}