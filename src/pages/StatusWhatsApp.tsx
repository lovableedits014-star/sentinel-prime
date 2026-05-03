import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Loader2, QrCode,
  RefreshCw, Wifi, WifiOff, ListRestart, ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";

type Instance = {
  id: string;
  apelido: string;
  status: string;
  phone_number: string | null;
  is_active: boolean;
  is_primary: boolean;
  last_health_check_at: string | null;
  last_send_at: string | null;
  last_disconnected_at: string | null;
  connected_since: string | null;
  messages_sent_today: number;
  total_sent: number | null;
  total_failed: number | null;
  consecutive_failures: number;
};

type RetryRow = { status: string; count: number };

const CONNECTED = new Set(["connected", "open"]);

function timeSince(iso: string | null): string {
  if (!iso) return "nunca";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `há ${Math.floor(diff)}s`;
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  return `há ${Math.floor(diff / 86400)}d`;
}

function downtimeLabel(inst: Instance): string | null {
  if (CONNECTED.has(inst.status)) return null;
  if (!inst.last_disconnected_at) return "offline";
  const min = Math.floor((Date.now() - new Date(inst.last_disconnected_at).getTime()) / 60000);
  if (min < 1) return "offline há instantes";
  if (min < 60) return `offline há ${min} min`;
  if (min < 1440) return `offline há ${Math.floor(min / 60)}h`;
  return `offline há ${Math.floor(min / 1440)}d`;
}

export default function StatusWhatsApp() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [retryStats, setRetryStats] = useState<RetryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadAll = async (silent = false) => {
    if (!silent) setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: client } = await supabase
      .from("clients").select("id").eq("user_id", user.id).maybeSingle();
    if (!client) { setLoading(false); return; }
    setClientId(client.id);

    const [{ data: inst }, { data: queue }] = await Promise.all([
      supabase.from("whatsapp_instances")
        .select("id,apelido,status,phone_number,is_active,is_primary,last_health_check_at,last_send_at,last_disconnected_at,connected_since,messages_sent_today,total_sent,total_failed,consecutive_failures")
        .eq("client_id", client.id)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true }),
      supabase.from("whatsapp_send_retry_queue")
        .select("status")
        .eq("client_id", client.id),
    ]);

    setInstances((inst || []) as Instance[]);
    const counts: Record<string, number> = {};
    (queue || []).forEach((q: any) => { counts[q.status] = (counts[q.status] || 0) + 1; });
    setRetryStats(Object.entries(counts).map(([status, count]) => ({ status, count })));
    setLastRefresh(new Date());
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    const t = setInterval(() => loadAll(true), 30000);
    return () => clearInterval(t);
  }, []);

  const summary = useMemo(() => {
    const total = instances.length;
    const connected = instances.filter((i) => CONNECTED.has(i.status)).length;
    const offline = total - connected;
    const offlineLong = instances.filter((i) =>
      !CONNECTED.has(i.status)
      && i.last_disconnected_at
      && (Date.now() - new Date(i.last_disconnected_at).getTime()) > 10 * 60_000
    ).length;
    return { total, connected, offline, offlineLong };
  }, [instances]);

  const pendingRetries = retryStats.find((r) => r.status === "pendente")?.count ?? 0;
  const failedRetries = retryStats.find((r) => r.status === "falha_definitiva")?.count ?? 0;

  const callBridge = async (action: string, instanceId: string) => {
    if (!clientId) return null;
    return supabase.functions.invoke("manage-whatsapp-instance", {
      body: { action, client_id: clientId, instance_id: instanceId },
    });
  };

  const handleHealthCheck = async (instanceId: string) => {
    setBusy(`check-${instanceId}`);
    const { data, error } = await callBridge("instance_status", instanceId);
    setBusy(null);
    if (error || data?.error) {
      toast.error("Falha na verificação: " + (error?.message || data?.error));
    } else {
      toast.success("Status atualizado.");
      loadAll(true);
    }
  };

  const handleReconnect = async (instanceId: string) => {
    setBusy(`reconnect-${instanceId}`);
    const { data, error } = await callBridge("reconnect", instanceId);
    setBusy(null);
    if (error || data?.error) {
      toast.error("Falha ao reconectar: " + (error?.message || data?.error));
    } else {
      toast.success("Reconexão solicitada — aguarde alguns segundos.");
      loadAll(true);
    }
  };

  const handleRescan = async (instanceId: string) => {
    setBusy(`rescan-${instanceId}`);
    const { data, error } = await callBridge("create_instance", instanceId);
    setBusy(null);
    if (error || data?.error) {
      toast.error("Falha ao gerar novo QR: " + (error?.message || data?.error));
    } else {
      toast.success("Novo QR Code gerado. Abra Configurações para escanear.");
      loadAll(true);
    }
  };

  const handleHealthCheckAll = async () => {
    if (!clientId) return;
    setBusy("check-all");
    const { data, error } = await supabase.functions.invoke("manage-whatsapp-instance", {
      body: { action: "health_check_all", client_id: clientId },
    });
    setBusy(null);
    if (error || data?.error || data?.success === false) toast.error("Falha: " + (error?.message || data?.error || "verificação não concluída"));
    else { toast.success("Verificação completa solicitada."); loadAll(true); }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Status WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitoramento em tempo real da saúde dos chips, última verificação automática e fila de reentrega.
            Atualiza automaticamente a cada 30 segundos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Atualizado {timeSince(lastRefresh.toISOString())}
          </span>
          <Button size="sm" variant="outline" onClick={() => loadAll()} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={handleHealthCheckAll} disabled={busy === "check-all"}>
            {busy === "check-all" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Activity className="w-3.5 h-3.5 mr-1" />}
            Verificar todas agora
          </Button>
        </div>
      </div>

      {/* Banner de incidentes */}
      {(summary.offlineLong > 0 || pendingRetries > 0) && (
        <Card className="border-red-500/40 bg-red-50 dark:bg-red-950/20">
          <CardContent className="pt-4 flex flex-wrap items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-red-700 dark:text-red-400">
                Atenção necessária
              </p>
              <p className="text-xs text-red-700/80 dark:text-red-400/80">
                {summary.offlineLong > 0 && `${summary.offlineLong} instância(s) offline há mais de 10 min. `}
                {pendingRetries > 0 && `${pendingRetries} envio(s) aguardando na fila de retentativas.`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cartões de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total de chips</p>
            <p className="text-2xl font-bold">{summary.total}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/30">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Conectados</p>
            <p className="text-2xl font-bold text-emerald-600">{summary.connected}</p>
          </CardContent>
        </Card>
        <Card className={summary.offline > 0 ? "border-red-500/30" : ""}>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Offline</p>
            <p className={`text-2xl font-bold ${summary.offline > 0 ? "text-red-600" : ""}`}>{summary.offline}</p>
          </CardContent>
        </Card>
        <Card className={pendingRetries > 0 ? "border-amber-500/30" : ""}>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              Fila de retry
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ListRestart className="w-3 h-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">
                      Envios automáticos (aniversário, alertas) que falharam por desconexão. São reprocessados automaticamente a cada 2 minutos quando algum chip volta a ficar online.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </p>
            <p className={`text-2xl font-bold ${pendingRetries > 0 ? "text-amber-600" : ""}`}>{pendingRetries}</p>
            {failedRetries > 0 && (
              <p className="text-[11px] text-red-600 mt-0.5">{failedRetries} falha(s) definitiva(s)</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lista detalhada */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saúde por instância</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : instances.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Nenhuma instância configurada.
              <div className="mt-3">
                <Link to="/settings" className="text-primary inline-flex items-center gap-1 text-sm">
                  Adicionar instância <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="text-left py-2 pr-3">Instância</th>
                    <th className="text-left py-2 px-3">Status</th>
                    <th className="text-left py-2 px-3">Última verificação</th>
                    <th className="text-left py-2 px-3">Último envio</th>
                    <th className="text-left py-2 px-3">Falhas seguidas</th>
                    <th className="text-right py-2 pl-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {instances.map((inst) => {
                    const isConn = CONNECTED.has(inst.status);
                    const dt = downtimeLabel(inst);
                    const stale = inst.last_health_check_at
                      && (Date.now() - new Date(inst.last_health_check_at).getTime()) > 15 * 60_000;
                    return (
                      <tr key={inst.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-3 pr-3">
                          <div className="font-semibold">{inst.apelido}</div>
                          {inst.phone_number && (
                            <div className="text-[11px] text-muted-foreground font-mono">{inst.phone_number}</div>
                          )}
                          <div className="flex gap-1 mt-1">
                            {inst.is_primary && <Badge variant="outline" className="text-[9px] py-0 px-1.5 border-amber-400/60 text-amber-700 dark:text-amber-400">Principal</Badge>}
                            {!inst.is_active && <Badge variant="outline" className="text-[9px] py-0 px-1.5">Fora do pool</Badge>}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          {isConn ? (
                            <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                              <Wifi className="w-3 h-3" /> Conectado
                            </Badge>
                          ) : (
                            <div className="space-y-1">
                              <Badge variant="outline" className="gap-1 text-red-700 dark:text-red-400 border-red-500/40">
                                <WifiOff className="w-3 h-3" /> {inst.status === "connecting" ? "Conectando" : "Offline"}
                              </Badge>
                              {dt && <div className="text-[11px] text-red-600/80">{dt}</div>}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className={`flex items-center gap-1 text-xs ${stale ? "text-amber-600" : ""}`}>
                            <Clock className="w-3 h-3" />
                            {timeSince(inst.last_health_check_at)}
                          </div>
                          {stale && (
                            <div className="text-[10px] text-amber-600">verificação atrasada</div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-xs">
                          <div>{timeSince(inst.last_send_at)}</div>
                          <div className="text-[10px] text-muted-foreground">{inst.messages_sent_today} hoje</div>
                        </td>
                        <td className="py-3 px-3">
                          {inst.consecutive_failures > 0 ? (
                            <Badge variant="outline" className={`text-[10px] ${inst.consecutive_failures >= 3 ? "border-red-500/40 text-red-600" : "border-amber-500/40 text-amber-600"}`}>
                              {inst.consecutive_failures}
                            </Badge>
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          )}
                        </td>
                        <td className="py-3 pl-3">
                          <div className="flex justify-end gap-1 flex-wrap">
                            <Button size="sm" variant="outline" onClick={() => handleHealthCheck(inst.id)} disabled={busy === `check-${inst.id}`}>
                              {busy === `check-${inst.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
                            </Button>
                            {!isConn && (
                              <Button size="sm" variant="outline" onClick={() => handleReconnect(inst.id)} disabled={busy === `reconnect-${inst.id}`}>
                                {busy === `reconnect-${inst.id}` ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                                Reconectar
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => handleRescan(inst.id)} disabled={busy === `rescan-${inst.id}`}>
                              {busy === `rescan-${inst.id}` ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <QrCode className="w-3 h-3 mr-1" />}
                              Re-scan
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 text-xs text-muted-foreground border-t pt-3">
            <strong>Ações:</strong> <em>Verificar</em> consulta a ponte e atualiza o status agora ·{" "}
            <em>Reconectar</em> tenta religar sem novo QR (sessão preservada) ·{" "}
            <em>Re-scan</em> gera novo QR Code (use quando a sessão expirar — abra Configurações para escanear).
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
