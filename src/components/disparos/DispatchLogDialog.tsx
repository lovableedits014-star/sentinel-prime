import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";

type LogItem = {
  id: string;
  telefone: string;
  nome: string;
  status: string;
  enviado_em: string | null;
  erro: string | null;
};

const itemStatusMap: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  pendente: { label: "Pendente", icon: Clock, className: "text-muted-foreground" },
  enviado: { label: "Enviado", icon: CheckCircle, className: "text-emerald-600" },
  falha: { label: "Falha", icon: XCircle, className: "text-destructive" },
};

export default function DispatchLogDialog({ dispatchId, titulo }: { dispatchId: string; titulo: string }) {
  const [open, setOpen] = useState(false);

  const { data: items = [], isLoading } = useQuery<LogItem[]>({
    queryKey: ["dispatch-log", dispatchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_dispatch_items" as any)
        .select("*")
        .eq("dispatch_id", dispatchId)
        .order("created_at", { ascending: true })
        .limit(500);
      return (data as unknown as LogItem[]) || [];
    },
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });

  const sent = items.filter(i => i.status === "enviado").length;
  const failed = items.filter(i => i.status === "falha").length;
  const pending = items.filter(i => i.status === "pendente").length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1">
          <FileText className="h-3 w-3" />
          Log
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Log de Envio — {titulo}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-3 text-xs mb-3">
          <Badge variant="outline" className="gap-1">✅ {sent} enviados</Badge>
          <Badge variant="outline" className="gap-1">❌ {failed} falhas</Badge>
          <Badge variant="outline" className="gap-1">⏳ {pending} pendentes</Badge>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-1">
              {items.map((item) => {
                const cfg = itemStatusMap[item.status] || itemStatusMap.pendente;
                const Icon = cfg.icon;
                return (
                  <div key={item.id} className="flex items-center gap-2 rounded border px-3 py-1.5 text-sm">
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.className}`} />
                    <span className="flex-1 truncate">{item.nome}</span>
                    <span className="text-xs text-muted-foreground font-mono">{item.telefone}</span>
                    {item.enviado_em && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.enviado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    {item.erro && (
                      <span className="text-xs text-destructive max-w-[120px] truncate" title={item.erro}>
                        {item.erro}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
