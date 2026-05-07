import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Loader2, RefreshCw, Trash2, AlertCircle, CheckCircle2, Activity } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";

const TIPO_LABEL: Record<string, { label: string; icon: any; color: string }> = {
  intensificacao: { label: "Intensificação", icon: TrendingUp, color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  abandono: { label: "Abandono", icon: TrendingDown, color: "bg-red-500/15 text-red-700 dark:text-red-300" },
  mudanca_posicao: { label: "Mudança de posição", icon: Activity, color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  mudanca_tom: { label: "Mudança de tom", icon: Activity, color: "bg-purple-500/15 text-purple-700 dark:text-purple-300" },
  novo_recorte: { label: "Novo recorte", icon: Activity, color: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  promessa_nova: { label: "Promessas novas", icon: TrendingUp, color: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300" },
  mudanca: { label: "Mudança", icon: Activity, color: "bg-muted text-muted-foreground" },
};

const SEVERIDADE_BORDER: Record<string, string> = {
  alta: "border-red-500/40 bg-red-500/5",
  media: "border-amber-500/40 bg-amber-500/5",
  baixa: "border-blue-500/40 bg-blue-500/5",
};

export function DriftPanel({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (progressTimer.current) clearInterval(progressTimer.current); }, []);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["ic-drift", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ic_drift_analyses" as any)
        .select("*")
        .eq("client_id", clientId)
        .order("periodo_fim", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ic_drift_analyses" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ic-drift", clientId] });
      toast.success("Análise removida");
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function runDrift() {
    setRunning(true); setLastError(null); setLastSuccess(null);
    setProgress(5); setStatusMsg("Carregando documentos…");
    if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.max(1, Math.round((90 - p) / 18)) : p));
    }, 800);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setStatusMsg("Comparando períodos com IA…");
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ic-detect-drift`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ clientId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao analisar drift");
      setProgress(100);
      setStatusMsg("");
      setLastSuccess(
        j.drifts > 0
          ? `${j.drifts} mudança(s) detectada(s) em ${j.temas_analisados} tema(s).`
          : j.mensagem || `Nenhuma mudança relevante (${j.temas_analisados ?? 0} tema(s) avaliado(s)).`
      );
      qc.invalidateQueries({ queryKey: ["ic-drift", clientId] });
    } catch (e: any) {
      setLastError(e.message);
      toast.error(e.message);
    } finally {
      if (progressTimer.current) { clearInterval(progressTimer.current); progressTimer.current = null; }
      setTimeout(() => { setRunning(false); setProgress(0); }, 600);
    }
  }

  const grouped = (data ?? []).reduce<Record<string, any[]>>((acc, d: any) => {
    const k = d.periodo_fim?.slice(0, 7) || "—";
    (acc[k] ||= []).push(d);
    return acc;
  }, {});
  const periodos = Object.keys(grouped).sort().reverse();

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Activity className="w-4 h-4 text-primary" />
                Drift de discurso
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Detecta como o discurso do candidato sobre cada tema evoluiu entre os trimestres.
                Aponta intensificação, abandono, mudança de tom ou de posição.
              </p>
            </div>
            <Button size="sm" onClick={runDrift} disabled={running}>
              {running
                ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                : <RefreshCw className="w-4 h-4 mr-1.5" />}
              {running ? "Analisando…" : "Analisar agora"}
            </Button>
          </div>

          {running && (
            <div className="space-y-1">
              <Progress value={progress} className="h-1.5" />
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> {statusMsg}
              </p>
            </div>
          )}
          {lastError && (
            <div className="text-xs text-red-700 dark:text-red-300 bg-red-500/10 border border-red-500/30 rounded px-3 py-2 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{lastError}</span>
            </div>
          )}
          {lastSuccess && !running && (
            <div className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded px-3 py-2 flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{lastSuccess}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando análises...
        </div>
      ) : (data ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground space-y-2">
            <Activity className="w-8 h-8 mx-auto text-muted-foreground/40" />
            <p>Nenhuma análise de drift ainda.</p>
            <p className="text-xs">
              Clique em <strong>Analisar agora</strong> para comparar o discurso do trimestre atual
              com os anteriores. É necessário ter ao menos 4 documentos com data e tags.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {periodos.map((p) => (
            <div key={p} className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Período encerrando em {p}
              </h4>
              <div className="grid gap-2">
                {grouped[p].map((d: any) => {
                  const meta = TIPO_LABEL[d.tipo_mudanca] || TIPO_LABEL.mudanca;
                  const Icon = meta.icon;
                  return (
                    <Card key={d.id} className={`border ${SEVERIDADE_BORDER[d.severidade] || "border-muted"}`}>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="secondary" className={`text-[10px] gap-1 ${meta.color}`}>
                                <Icon className="w-3 h-3" /> {meta.label}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] capitalize">{d.severidade}</Badge>
                              <Badge variant="outline" className="text-[10px]">Tema: {d.tema}</Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {d.periodo_inicio} → {d.periodo_fim} · {d.documentos_analisados} doc(s)
                              </span>
                            </div>
                            <p className="text-sm font-medium leading-snug">{d.titulo}</p>
                            {d.descricao && (
                              <p className="text-xs text-muted-foreground leading-relaxed">{d.descricao}</p>
                            )}
                            {Array.isArray(d.exemplos) && d.exemplos.length > 0 && (
                              <ul className="mt-2 space-y-1.5">
                                {d.exemplos.slice(0, 4).map((ex: any, i: number) => (
                                  <li key={i} className="text-[11px] text-muted-foreground border-l-2 border-muted pl-2">
                                    <span className="font-semibold capitalize">{ex.periodo || "—"}</span>
                                    {ex.data && <span className="ml-1 opacity-70">({ex.data})</span>}
                                    : {ex.trecho}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => { if (confirm("Remover esta análise?")) del.mutate(d.id); }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
