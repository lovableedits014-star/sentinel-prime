import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  Loader2, QrCode, Send, Trash2, Wifi, WifiOff, Pencil, Check, X, RefreshCw, Power, Star, Phone, Webhook, Users, ArrowRightLeft,
} from "lucide-react";
import { toast } from "sonner";
import { useWhatsAppGroups } from "@/hooks/useWhatsAppGroups";
import { useActiveClientId } from "@/hooks/useActiveClientId";
import ReassignInstanceDialog from "./ReassignInstanceDialog";

export interface PoolInstance {
  id: string;
  apelido: string;
  phone_number: string | null;
  status: string;
  is_active: boolean;
  is_primary: boolean;
  last_send_at: string | null;
  messages_sent_today: number;
  total_sent: number;
  total_failed: number;
  consecutive_failures: number;
  connected_since: string | null;
  last_disconnected_at: string | null;
  health_score: number;
  success_rate_24h: number;
  sent_24h: number;
  bridge_url: string | null;
  bridge_instance_id?: string | null;
  last_keepalive_at?: string | null;
  last_keepalive_status?: string | null;
  last_auto_reconnect_at?: string | null;
  last_webhook_rebound_at?: string | null;
  last_disconnect_reason?: string | null;
  created_at: string;
}

interface Props {
  clientId: string;
  instance: PoolInstance;
  onChange: () => void;
}

function timeSince(iso: string | null | undefined): string {
  if (!iso) return "nunca";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `há ${Math.floor(diff)}s`;
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  return `há ${Math.floor(diff / 86400)}d`;
}

function healthLabel(score: number): { color: string; label: string; ring: string } {
  if (score >= 70) return { color: "text-emerald-600", ring: "ring-emerald-500/30 bg-emerald-500/10", label: "Saudável" };
  if (score >= 40) return { color: "text-amber-600", ring: "ring-amber-500/30 bg-amber-500/10", label: "Atenção" };
  return { color: "text-red-600", ring: "ring-red-500/30 bg-red-500/10", label: "Em risco" };
}

function formatPhoneBR(raw: string | null): string {
  if (!raw) return "";
  const d = String(raw).replace(/\D/g, "");
  // 55 + DDD(2) + número(8 ou 9)
  if (d.length >= 12 && d.startsWith("55")) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    if (rest.length === 9) return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    if (rest.length === 8) return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return d;
}

const CONNECTED = new Set(["connected", "open"]);

const normalizeQrCode = (raw?: string | null) => {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:image")) return trimmed;
  if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 100) return `data:image/png;base64,${trimmed}`;
  return trimmed;
};

export default function WhatsAppInstancePoolCard({ clientId, instance, onChange }: Props) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(instance.apelido);
  const [busy, setBusy] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrAge, setQrAge] = useState(0);
  const [scanTimedOut, setScanTimedOut] = useState(false);
  const [polling, setPolling] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [reassignOpen, setReassignOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrReceivedAtRef = useRef<number | null>(null);
  const qrCodeRef = useRef<string | null>(null);
  const { groups, isSyncing, syncFromInstance } = useWhatsAppGroups(clientId);
  const { isSuperAdmin } = useActiveClientId();
  const groupsForThisInstance = groups.filter((g) => g.instance_id === instance.id).length;

  useEffect(() => setName(instance.apelido), [instance.apelido]);

  const setStoredQrCode = (value: string | null) => {
    if (value && value !== qrCodeRef.current) {
      qrReceivedAtRef.current = Date.now();
      setQrAge(0);
      setScanTimedOut(false);
    }
    if (!value) {
      qrReceivedAtRef.current = null;
      setQrAge(0);
    }
    qrCodeRef.current = value;
    setQrCode(value);
  };

  useEffect(() => {
    if (!qrReceivedAtRef.current) return;
    const id = setInterval(() => {
      if (!qrReceivedAtRef.current) return;
      setQrAge(Math.floor((Date.now() - qrReceivedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [qrCode]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setPolling(false);
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const invoke = async (action: string, extra: Record<string, unknown> = {}) => {
    return supabase.functions.invoke("manage-whatsapp-instance", {
      body: { action, client_id: clientId, instance_id: instance.id, ...extra },
    });
  };

  const startPolling = () => {
    stopPolling();
    setPolling(true);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      const { data } = await invoke("instance_status");
      const status = String(data?.status || data?.instance?.status || "").toLowerCase();
      const nextQr = normalizeQrCode(data?.qrcode || data?.instance?.qrcode);
      if (nextQr) setStoredQrCode(nextQr);
      if (CONNECTED.has(status)) {
        setStoredQrCode(null);
        setScanTimedOut(false);
        stopPolling();
        toast.success(`${instance.apelido} conectado!`);
        onChange();
      } else if (attempts >= 25) {
        stopPolling();
        setScanTimedOut(true);
        toast.error(`Tempo esgotado: ${instance.apelido} não confirmou a conexão. Gere um QR novo e tente novamente.`);
        onChange();
      }
    }, 8000);
  };

  const handleConnect = async () => {
    setBusy("connect");
    try {
      // Antes de pedir QR/recriar a instância, valida ao vivo se a ponte já
      // está conectada. Evita ações desnecessárias na ponte (anti-ban) e
      // destrava o caso em que a UI mostra "desconectada" mas a sessão está viva.
      const { data: statusData } = await invoke("instance_status");
      const liveStatus = String(statusData?.status || statusData?.instance?.status || "").toLowerCase();
      if (CONNECTED.has(liveStatus)) {
        toast.success(`${instance.apelido} já está conectado.`);
        onChange();
        return;
      }

      setStoredQrCode(null);
      setScanTimedOut(false);
      const { data, error } = await invoke("create_instance");
      if (data?.cooldown) {
        const secs = Number(data?.remaining_seconds || 0);
        const mins = Math.ceil(secs / 60);
        toast.error(
          `🛡️ Proteção anti-ban ativa. Aguarde ~${mins} min antes de tentar reconectar este número. ` +
          `Reconectar várias vezes seguidas é um dos principais gatilhos de banimento do WhatsApp.`,
          { duration: 8000 },
        );
        return;
      }
      if (data?.requires_force_recreate) {
        toast.error(data.error || "Não foi possível recuperar a sessão sem recriar QR. Use 'Gerar novo QR' apenas se aceitar derrubar a sessão atual.", { duration: 9000 });
        return;
      }
      if (error || data?.error) {
        toast.error("Erro: " + (error?.message || data?.error));
        return;
      }
      const qr = normalizeQrCode(data?.qrcode || data?.instance?.qrcode);
      if (qr) setStoredQrCode(qr);
      startPolling();
      onChange();
    } finally {
      setBusy(null);
    }
  };

  const handleRepairConnection = async () => {
    setBusy("reconnect");
    try {
      const { data, error } = await invoke("reconnect");
      if (data?.cooldown) {
        const mins = Math.ceil(Number(data?.remaining_seconds || 0) / 60);
        toast.error(`🛡️ Proteção anti-ban ativa. Aguarde ~${mins} min antes de reparar/reconectar novamente.`, { duration: 8000 });
        return;
      }
      if (error || data?.error) {
        toast.error("Falha ao reparar conexão: " + (error?.message || data?.error));
        return;
      }
      const qr = normalizeQrCode(data?.qrcode || data?.instance?.qrcode);
      if (qr) {
        setStoredQrCode(qr);
        startPolling();
        toast.info("QR recebido. Escaneie apenas uma vez e aguarde a confirmação.");
      } else if (CONNECTED.has(String(data?.status || data?.instance?.status || "").toLowerCase())) {
        setStoredQrCode(null);
        toast.success("Conexão reparada e confirmada.");
      } else {
        toast.info("Reparo solicitado. Aguarde alguns segundos e verifique o status.");
      }
      onChange();
    } finally {
      setBusy(null);
    }
  };

  const handleForceNewQr = async () => {
    const ok = window.confirm(
      "Gerar novo QR pode derrubar a sessão atual e conta como tentativa anti-ban. Use só se o QR/reparo normal falhou. Deseja continuar?",
    );
    if (!ok) return;
    setBusy("force-qr");
    try {
      setStoredQrCode(null);
      setScanTimedOut(false);
      const { data, error } = await invoke("create_instance", { force_recreate: true });
      if (data?.cooldown) {
        const mins = Math.ceil(Number(data?.remaining_seconds || 0) / 60);
        toast.error(`🛡️ Proteção anti-ban ativa. Aguarde ~${mins} min antes de gerar outro QR.`, { duration: 8000 });
        return;
      }
      if (error || data?.error) {
        toast.error("Erro ao gerar QR: " + (error?.message || data?.error));
        return;
      }
      const qr = normalizeQrCode(data?.qrcode || data?.instance?.qrcode);
      if (qr) setStoredQrCode(qr);
      startPolling();
      onChange();
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = async () => {
    setBusy("disconnect");
    try {
      await invoke("disconnect");
      setStoredQrCode(null);
      setScanTimedOut(false);
      stopPolling();
      toast.success("Instância desconectada.");
      onChange();
    } finally { setBusy(null); }
  };

  const handleDelete = async () => {
    setBusy("delete");
    const { data, error } = await invoke("delete_instance_record");
    setBusy(null);
    if (error || data?.error) toast.error("Erro: " + (error?.message || data?.error));
    else { toast.success("Instância removida."); onChange(); }
  };

  const togglePool = async (active: boolean) => {
    await invoke("update_instance_record", { is_active: active });
    onChange();
  };

  const handleSetPrimary = async () => {
    setBusy("primary");
    const { data, error } = await invoke("set_primary_instance");
    setBusy(null);
    if (error || data?.error) {
      toast.error("Erro: " + (error?.message || data?.error));
    } else {
      toast.success(`"${instance.apelido}" definido como instância principal.`);
      onChange();
    }
  };

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === instance.apelido) { setEditingName(false); return; }
    await invoke("update_instance_record", { apelido: trimmed });
    setEditingName(false);
    onChange();
  };

  const handleTest = async () => {
    const phone = testPhone.replace(/\D/g, "");
    if (phone.length < 10) { toast.error("Número inválido"); return; }
    setBusy("test");
    const { data, error } = await invoke("send", {
      phone,
      message: `✅ Teste do chip "${instance.apelido}" — Sentinelle.`,
    });
    setBusy(null);
    if (error || data?.error) toast.error("Falha: " + (error?.message || data?.error));
    else toast.success("Mensagem de teste enviada!");
  };

  const handleSetWebhook = async () => {
    setBusy("webhook");
    const { data, error } = await invoke("set_webhook");
    setBusy(null);
    if (error || data?.error) {
      toast.error("Erro ao ativar webhook: " + (error?.message || data?.error));
    } else {
      toast.success("Confirmação automática ativada! Mensagens recebidas confirmarão o WhatsApp do contato automaticamente.");
    }
  };

  const isConnected = CONNECTED.has(instance.status);
  const health = healthLabel(instance.health_score);
  const isNew = instance.connected_since
    && (Date.now() - new Date(instance.connected_since).getTime()) < 7 * 86400000;
  const formattedPhone = formatPhoneBR(instance.phone_number);

  return (
    <div
      id={`wa-instance-${instance.id}`}
      className={`border rounded-lg p-4 space-y-3 bg-card transition-all ${instance.is_primary ? "ring-2 ring-amber-400/50 border-amber-400/40" : ""}`}
    >
      {/* Header: health + name + status */}
      <div className="flex items-start gap-3">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`w-12 h-12 rounded-full ring-2 ${health.ring} flex flex-col items-center justify-center cursor-help shrink-0`}>
                <span className={`text-sm font-bold leading-none ${health.color}`}>{instance.health_score}</span>
                <span className="text-[9px] text-muted-foreground leading-none mt-0.5">saúde</span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs">
                <b>Health Score: {health.label}</b><br />
                Combina tempo de descanso (70%) e taxa de entrega 24h (30%).<br />
                <b>{">70"}</b> saudável · <b>40-70</b> atenção · <b>{"<40"}</b> em risco.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-1">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-7 text-sm"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && saveName()}
              />
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveName}><Check className="w-3.5 h-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setName(instance.apelido); setEditingName(false); }}><X className="w-3.5 h-3.5" /></Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 max-w-full">
              <button className="group flex items-center gap-1 min-w-0" onClick={() => setEditingName(true)}>
                <span className="font-semibold text-sm truncate">{instance.apelido}</span>
                <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
              {instance.is_primary && (
                <Badge variant="outline" className="text-[9px] gap-0.5 border-amber-400/60 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0">
                  <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" /> Principal
                </Badge>
              )}
            </div>
          )}

          {/* Telefone conectado em destaque */}
          {formattedPhone ? (
            <div className="flex items-center gap-1 mt-1 text-[12px] font-mono font-semibold text-foreground">
              <Phone className="w-3 h-3 text-emerald-600" />
              {formattedPhone}
            </div>
          ) : isConnected ? (
            <div className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground italic">
              <Phone className="w-3 h-3" /> número não detectado — clique em Reconectar
            </div>
          ) : null}

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {isConnected ? (
              <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                <Wifi className="w-2.5 h-2.5" /> Conectado
              </Badge>
            ) : instance.status === "banned" ? (
              <Badge variant="destructive" className="text-[10px]">Banido</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                <WifiOff className="w-2.5 h-2.5" /> {instance.status === "connecting" ? "Conectando..." : "Desconectado"}
              </Badge>
            )}
            {isNew && (
              <Badge variant="outline" className="text-[10px] border-blue-500/40 text-blue-700 dark:text-blue-400">Chip novo</Badge>
            )}
            {instance.last_keepalive_at && (
              <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
                Mantendo conectado · {timeSince(instance.last_keepalive_at)}
              </Badge>
            )}
          </div>
          {(instance.last_auto_reconnect_at || instance.last_disconnect_reason || instance.bridge_instance_id) && (
            <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
              {instance.last_auto_reconnect_at && <div>Recuperado automaticamente {timeSince(instance.last_auto_reconnect_at)}</div>}
              {instance.bridge_instance_id && <div className="font-mono truncate">ponte: {instance.bridge_instance_id}</div>}
              {instance.last_disconnect_reason && !isConnected && (
                <div className="text-red-600 truncate" title={instance.last_disconnect_reason}>{instance.last_disconnect_reason}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs border-t border-b py-2">
        <div>
          <p className="font-semibold">{instance.messages_sent_today}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">hoje</p>
        </div>
        <div>
          <p className="font-semibold">{instance.success_rate_24h}%</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">entrega 24h</p>
        </div>
        <div>
          <p className="font-semibold text-[11px]">{timeSince(instance.last_send_at)}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">último envio</p>
        </div>
      </div>

      {/* QR Code se em conexão */}
      {qrCode && (
        <div className="text-center border rounded-md p-3 bg-white space-y-2">
          <img src={qrCode} alt="QR Code" className="w-44 h-44 mx-auto" />
          <p className="text-[11px] text-slate-700">
            Escaneie no WhatsApp do número desejado · {qrAge}s
          </p>
          {qrAge >= 30 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-900">
              Se o celular ficou carregando, este QR expirou. Gere um QR novo antes de tentar de novo.
            </div>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleForceNewQr}
            disabled={busy === "force-qr"}
            className="h-8 gap-1.5 text-xs text-slate-800 border-slate-300 hover:bg-slate-100"
          >
            {busy === "force-qr" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Gerar novo QR
          </Button>
        </div>
      )}
      {scanTimedOut && !qrCode && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          A instância foi criada na ponte, mas não confirmou conexão no WhatsApp. Gere um QR novo e escaneie novamente.
        </div>
      )}
      {polling && !qrCode && (
        <div className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1 py-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Aguardando QR Code...
        </div>
      )}

      {/* Pool toggle */}
      <div className="flex items-center justify-between bg-muted/30 rounded-md px-3 py-2">
        <Label htmlFor={`pool-${instance.id}`} className="text-xs cursor-pointer">
          Incluir no pool de rotação
        </Label>
        <Switch
          id={`pool-${instance.id}`}
          checked={instance.is_active}
          onCheckedChange={togglePool}
        />
      </div>

      {/* Botão Tornar Principal */}
      {!instance.is_primary && (
        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs gap-1 border-amber-400/40 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/20"
          onClick={handleSetPrimary}
          disabled={busy === "primary"}
        >
          {busy === "primary" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Star className="w-3.5 h-3.5" />
          )}
          Tornar instância principal
        </Button>
      )}

      {/* Ações */}
      <div className="flex flex-wrap gap-1.5">
        {!isConnected ? (
          <Button size="sm" variant="default" onClick={handleConnect} disabled={busy === "connect"} className="bg-green-600 hover:bg-green-700 text-white">
            {busy === "connect" ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <QrCode className="w-3.5 h-3.5 mr-1" />}
            Conectar
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => setShowTest((v) => !v)}>
              <Send className="w-3.5 h-3.5 mr-1" /> Testar
            </Button>
            <Button size="sm" variant="outline" onClick={handleRepairConnection} disabled={busy === "reconnect"}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${busy === "reconnect" ? "animate-spin" : ""}`} /> Reparar conexão
            </Button>
            <Button size="sm" variant="outline" onClick={handleDisconnect} disabled={busy === "disconnect"}>
              <Power className="w-3.5 h-3.5 mr-1" /> Desconectar
            </Button>
            {instance.is_primary && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSetWebhook}
                      disabled={busy === "webhook"}
                      className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                    >
                      {busy === "webhook" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                      ) : (
                        <Webhook className="w-3.5 h-3.5 mr-1" />
                      )}
                      Ativar confirmação automática
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">
                      Registra o webhook desta instância (número oficial) para confirmar
                      automaticamente o WhatsApp dos contatos assim que eles enviam uma
                      mensagem. Só precisa fazer isso 1 vez por instância.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {instance.is_primary && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => syncFromInstance(instance.id)}
                      disabled={isSyncing}
                      className="border-blue-500/40 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                    >
                      {isSyncing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                      ) : (
                        <Users className="w-3.5 h-3.5 mr-1" />
                      )}
                      Sincronizar grupos{groupsForThisInstance > 0 ? ` (${groupsForThisInstance})` : ""}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">
                      Lista os grupos de WhatsApp em que este número participa, para
                      você poder enviar disparos diretamente para eles a partir da página
                      Disparos. Pode rodar quantas vezes quiser.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </>
        )}

        {isSuperAdmin && (
          <Button
            size="sm"
            variant="ghost"
            className="text-amber-700 hover:text-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/30"
            onClick={() => setReassignOpen(true)}
            title="Mover esta instância para outro cliente (super admin)"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
          </Button>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 ml-auto">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover instância?</AlertDialogTitle>
              <AlertDialogDescription>
                A instância <b>{instance.apelido}</b> será desconectada e removida permanentemente.
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {showTest && isConnected && (
        <div className="flex gap-1.5 pt-1">
          <Input
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="5511999999999"
            className="h-8 text-xs font-mono"
          />
          <Button size="sm" onClick={handleTest} disabled={busy === "test" || !testPhone}>
            {busy === "test" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Enviar"}
          </Button>
        </div>
      )}

      <ReassignInstanceDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        instanceId={instance.id}
        instanceLabel={instance.apelido}
        currentClientId={clientId}
        onReassigned={onChange}
      />
    </div>
  );
}