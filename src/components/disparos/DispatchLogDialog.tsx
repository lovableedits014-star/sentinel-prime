import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, CheckCircle, XCircle, Clock, Loader2, RefreshCw, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fmtPhoneBR } from "@/lib/phone-utils";

type LogItem = {
  id: string;
  telefone: string;
  nome: string;
  status: string;
  enviado_em: string | null;
  erro: string | null;
  mensagem_personalizada?: string | null;
  variant_used?: string | null;
  cta_used?: string | null;
  replied_at?: string | null;
  reply_text?: string | null;
};

const itemStatusMap: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  pendente: { label: "Pendente", icon: Clock, className: "text-muted-foreground" },
  enviado: { label: "Enviado", icon: CheckCircle, className: "text-emerald-600" },
  falha: { label: "Falha", icon: XCircle, className: "text-destructive" },
  cancelado: { label: "Cancelado", icon: XCircle, className: "text-muted-foreground" },
};

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function DispatchLogDialog({ dispatchId, titulo }: { dispatchId: string; titulo: string }) {
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery<LogItem[]>({
    queryKey: ["dispatch-log", dispatchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_dispatch_items" as any)
        .select("*")
        .eq("dispatch_id", dispatchId)
        .order("created_at", { ascending: true })
        .limit(2000);
      return (data as unknown as LogItem[]) || [];
    },
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });

  const sent = items.filter(i => i.status === "enviado").length;
  const failed = items.filter(i => i.status === "falha").length;
  const pending = items.filter(i => i.status === "pendente").length;

  const handleRetryFailed = async () => {
    if (failed === 0) return;
    setRetrying(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp-dispatch", {
        body: { retry_failed_dispatch_id: dispatchId },
      });
      if (error) throw error;
      toast({
        title: "Reenvio iniciado",
        description: `${data?.retried ?? failed} número(s) com falha foram reenfileirados.`,
      });
      await queryClient.invalidateQueries({ queryKey: ["dispatch-log", dispatchId] });
      await queryClient.invalidateQueries({ queryKey: ["dispatches"] });
    } catch (err: any) {
      toast({
        title: "Falha ao reenviar",
        description: err?.message || "Não foi possível reenviar os números com falha.",
        variant: "destructive",
      });
    } finally {
      setRetrying(false);
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      // Busca até 20k itens para exportação — muito além dos 2k do preview.
      const pageSize = 1000;
      let all: LogItem[] = [];
      for (let from = 0; from < 20000; from += pageSize) {
        const { data, error } = await supabase
          .from("whatsapp_dispatch_items" as any)
          .select("*")
          .eq("dispatch_id", dispatchId)
          .order("created_at", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const chunk = (data as unknown as LogItem[]) || [];
        all = all.concat(chunk);
        if (chunk.length < pageSize) break;
      }

      const header = [
        "nome", "telefone", "status", "enviado_em", "cta_used",
        "variante_enviada", "replied_at", "reply_text", "erro",
      ];
      const lines = [header.join(",")];
      for (const it of all) {
        lines.push([
          csvEscape(it.nome),
          csvEscape(it.telefone),
          csvEscape(it.status),
          csvEscape(it.enviado_em || ""),
          csvEscape(it.cta_used || ""),
          csvEscape(it.variant_used || it.mensagem_personalizada || ""),
          csvEscape(it.replied_at || ""),
          csvEscape(it.reply_text || ""),
          csvEscape(it.erro || ""),
        ].join(","));
      }
      // BOM para Excel abrir com acentos corretos.
      const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeTitle = (titulo || "disparo").replace(/[^\w\-]+/g, "_").slice(0, 40);
      a.href = url;
      a.download = `disparo_${safeTitle}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Exportação concluída", description: `${all.length} contatos exportados.` });
    } catch (err: any) {
      toast({
        title: "Falha ao exportar",
        description: err?.message || "Não foi possível gerar o CSV.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

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

        <div className="flex items-center gap-3 text-xs mb-3 flex-wrap">
          <Badge variant="outline" className="gap-1">✅ {sent} enviados</Badge>
          <Badge variant="outline" className="gap-1">❌ {failed} falhas</Badge>
          <Badge variant="outline" className="gap-1">⏳ {pending} pendentes</Badge>
          <div className="ml-auto flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1"
              onClick={handleExportCsv}
              disabled={exporting || items.length === 0}
            >
              {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              Exportar CSV
            </Button>
            {failed > 0 && pending === 0 && (
              <Button
                size="sm"
                variant="default"
                className="h-7 gap-1"
                onClick={handleRetryFailed}
                disabled={retrying}
              >
                {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Reenviar falhas ({failed})
              </Button>
            )}
          </div>
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
