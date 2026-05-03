import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Config = {
  id?: string;
  client_id: string;
  enabled: boolean;
  frequency: "daily" | "weekly";
  hour_utc: number;
  weekday: number;
  resolve_invalid_ids: boolean;
  relink_orphans: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
};

type Run = {
  id: string;
  ran_at: string;
  status: string;
  linked_count: number;
  resolved_count: number;
  message: string | null;
  triggered_by: string;
};

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function utcHourToLocalLabel(utcHour: number): string {
  const d = new Date();
  d.setUTCHours(utcHour, 0, 0, 0);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function localHourToUtc(localHour: number): number {
  const d = new Date();
  d.setHours(localHour, 0, 0, 0);
  return d.getUTCHours();
}

function utcHourToLocal(utcHour: number): number {
  const d = new Date();
  d.setUTCHours(utcHour, 0, 0, 0);
  return d.getHours();
}

export default function AutoresolveScheduler({ clientId }: { clientId: string }) {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("engagement_autoresolve_config" as any)
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();
    setCfg(
      (data as any) ?? {
        client_id: clientId,
        enabled: false,
        frequency: "daily",
        hour_utc: 11,
        weekday: 1,
        resolve_invalid_ids: true,
        relink_orphans: true,
        last_run_at: null,
        last_run_status: null,
        last_run_message: null,
      }
    );
    const { data: runsData } = await supabase
      .from("engagement_autoresolve_runs" as any)
      .select("*")
      .eq("client_id", clientId)
      .order("ran_at", { ascending: false })
      .limit(10);
    setRuns((runsData as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (clientId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const payload = {
        client_id: clientId,
        enabled: cfg.enabled,
        frequency: cfg.frequency,
        hour_utc: cfg.hour_utc,
        weekday: cfg.weekday,
        resolve_invalid_ids: cfg.resolve_invalid_ids,
        relink_orphans: cfg.relink_orphans,
      };
      const { error } = await supabase
        .from("engagement_autoresolve_config" as any)
        .upsert(payload, { onConflict: "client_id" });
      if (error) throw error;
      toast.success("Agendamento salvo");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("run-engagement-autoresolve", {
        body: { client_id: clientId, force: true, triggered_by: "manual" },
      });
      if (error) throw error;
      const result = (data as any)?.results?.[0];
      if (result) {
        toast.success(
          `Executado: ${result.linked ?? 0} vínculos, ${result.resolved ?? 0} perfis resolvidos`
        );
      } else {
        toast.info("Nenhuma execução realizada");
      }
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao executar");
    } finally {
      setRunning(false);
    }
  };

  if (loading || !cfg) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reprocessamento Automático</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  const localHour = utcHourToLocal(cfg.hour_utc);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Reprocessamento Automático
        </CardTitle>
        <CardDescription>
          Configure para o sistema resolver IDs inválidos e religar interações órfãs automaticamente, sem precisar clicar nos botões.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="text-base">Ativar agendamento</Label>
            <p className="text-xs text-muted-foreground">
              Quando ativo, o sistema executa as ações abaixo automaticamente no horário configurado.
            </p>
          </div>
          <Switch
            checked={cfg.enabled}
            onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Frequência</Label>
            <Select
              value={cfg.frequency}
              onValueChange={(v: "daily" | "weekly") => setCfg({ ...cfg, frequency: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Diária</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Horário (seu fuso)</Label>
            <Select
              value={String(localHour)}
              onValueChange={(v) =>
                setCfg({ ...cfg, hour_utc: localHourToUtc(parseInt(v)) })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }).map((_, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {String(i).padStart(2, "0")}:00
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Equivalente UTC: {utcHourToLocalLabel(cfg.hour_utc)} → {String(cfg.hour_utc).padStart(2, "0")}:00 UTC
            </p>
          </div>

          {cfg.frequency === "weekly" && (
            <div className="space-y-2">
              <Label>Dia da semana</Label>
              <Select
                value={String(cfg.weekday)}
                onValueChange={(v) => setCfg({ ...cfg, weekday: parseInt(v) })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((d, i) => (
                    <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <Label className="text-base">Ações executadas</Label>
          <div className="flex items-center justify-between">
            <div className="text-sm">Resolver perfis com ID inválido</div>
            <Switch
              checked={cfg.resolve_invalid_ids}
              onCheckedChange={(v) => setCfg({ ...cfg, resolve_invalid_ids: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm">Religar interações órfãs</div>
            <Switch
              checked={cfg.relink_orphans}
              onCheckedChange={(v) => setCfg({ ...cfg, relink_orphans: v })}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={saving}>
            {saving ? "Salvando..." : "Salvar agendamento"}
          </Button>
          <Button variant="outline" onClick={runNow} disabled={running}>
            <Play className="mr-2 h-4 w-4" />
            {running ? "Executando..." : "Executar agora"}
          </Button>
          <Button variant="ghost" size="icon" onClick={load} title="Atualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {cfg.last_run_at && (
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="font-medium">Última execução:</span>
              <span>{new Date(cfg.last_run_at).toLocaleString()}</span>
              <Badge variant={cfg.last_run_status === "success" ? "default" : "destructive"}>
                {cfg.last_run_status}
              </Badge>
            </div>
            {cfg.last_run_message && (
              <p className="mt-1 text-xs text-muted-foreground">{cfg.last_run_message}</p>
            )}
          </div>
        )}

        {runs.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm">Histórico recente</Label>
            <div className="space-y-1 text-xs">
              {runs.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded border p-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={r.status === "success" ? "secondary" : "destructive"} className="text-[10px]">
                      {r.status}
                    </Badge>
                    <span>{new Date(r.ran_at).toLocaleString()}</span>
                    <span className="text-muted-foreground">({r.triggered_by})</span>
                  </div>
                  <div className="text-muted-foreground">
                    {r.linked_count} vínculos · {r.resolved_count} perfis
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}