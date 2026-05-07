import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, Loader2, Check, X, Megaphone, AlertTriangle, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";

const PRIORIDADE_COLOR: Record<string, string> = {
  alta: "border-red-500/40 bg-red-500/5",
  media: "border-amber-500/40 bg-amber-500/5",
  baixa: "border-blue-500/40 bg-blue-500/5",
};

export function InsightsCard({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (progressTimer.current) clearInterval(progressTimer.current); }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["ic-insights", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ic_memoria_insights" as any)
        .select("*")
        .eq("client_id", clientId)
        .eq("status", "novo")
        .order("prioridade", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  async function runInsights() {
    setRunning(true);
    setLastError(null);
    setLastSuccess(null);
    setProgress(5);
    setStatusMsg("Analisando memória…");
    if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.max(1, Math.round((90 - p) / 12)) : p));
    }, 600);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setStatusMsg("Gerando insights com IA…");
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ic-memoria-insights`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ clientId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Falha (HTTP ${r.status})`);
      setProgress(100);
      const msg = `${j.gerados ?? 0} insight(s) gerado(s)`;
      setStatusMsg(msg);
      setLastSuccess(msg);
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["ic-insights", clientId] });
    } catch (e: any) {
      const msg = e?.message || "Erro ao gerar insights";
      setLastError(msg);
      setStatusMsg("");
      toast.error(msg);
    } finally {
      if (progressTimer.current) { clearInterval(progressTimer.current); progressTimer.current = null; }
      setRunning(false);
      setTimeout(() => setProgress(0), 1500);
    }
  }

  const updStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("ic_memoria_insights" as any).update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ic-insights", clientId] }),
  });

  if (isLoading) return null;
  const items = data ?? [];

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-amber-500/5 to-transparent">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-600" />
          <h3 className="text-sm font-semibold">Insights da memória</h3>
          <Badge variant="secondary" className="ml-1 text-[10px]">{items.length}</Badge>
          <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={runInsights} disabled={running}>
            {running ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
            Atualizar
          </Button>
        </div>

        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum insight no momento. Clique em <strong>Atualizar</strong> para que o sistema analise a memória e sugira ações.
          </p>
        ) : (
          <div className="grid gap-2">
            {items.map((it: any) => (
              <div key={it.id} className={`rounded-md border p-2.5 ${PRIORIDADE_COLOR[it.prioridade] || ""}`}>
                <div className="flex items-start gap-2">
                  {it.prioridade === "alta" && <AlertTriangle className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold leading-tight">{it.titulo}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{it.descricao}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-6 w-6" title="Aceitar / marcar como visto"
                      onClick={() => updStatus.mutate({ id: it.id, status: "aceito" })}>
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" title="Descartar"
                      onClick={() => updStatus.mutate({ id: it.id, status: "descartado" })}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
