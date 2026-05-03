import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Loader2, Wifi, WifiOff, Smartphone, QrCode, RefreshCw,
  Send, CheckCircle2, XCircle, Unplug
} from "lucide-react";

interface WhatsAppInstanceCardProps {
  clientId: string;
}

type ConnectionState = "loading" | "not_configured" | "awaiting_scan" | "connected" | "disconnected";

type BridgeResponse = {
  error?: string;
  qrcode?: string | null;
  status?: string | null;
  success?: boolean;
  requires_reconnect?: boolean;
  instance?: {
    status?: string | null;
    qrcode?: string | null;
  } | null;
};

const CONNECTED_STATUSES = new Set(["connected", "open"]);

const getBridgeStatus = (data?: BridgeResponse | null) =>
  (data?.status || data?.instance?.status || "").toLowerCase();

const normalizeQrCode = (raw?: string | null) => {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Accept raw base64 too, by prefixing data URL
  if (trimmed.startsWith("data:image")) return trimmed;
  if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 100) {
    return `data:image/png;base64,${trimmed}`;
  }
  return trimmed;
};

const getQrCodeFromResponse = (data?: BridgeResponse | null) => {
  if (!data) return null;
  return normalizeQrCode(data.qrcode) ?? normalizeQrCode(data.instance?.qrcode);
};

const cleanPhoneForBridge = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.length === 13 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const local = digits.slice(4);
    return local.length === 9 && local.startsWith("9") ? `55${ddd}${local.slice(1)}` : digits;
  }

  if (digits.length === 11) {
    const ddd = digits.slice(0, 2);
    const local = digits.slice(2);
    return local.length === 9 && local.startsWith("9") ? `55${ddd}${local.slice(1)}` : `55${digits}`;
  }

  return digits.startsWith("55") ? digits : `55${digits}`;
};

export default function WhatsAppInstanceCard({ clientId }: WhatsAppInstanceCardProps) {
  const [state, setState] = useState<ConnectionState>("loading");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrCodeRef = useRef<string | null>(null);
  const pollAttemptsRef = useRef(0);
  const MAX_POLL_ATTEMPTS = 20; // ~60s at 3s interval

  const setStoredQrCode = (value: string | null) => {
    qrCodeRef.current = value;
    setQrCode(value);
  };

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Check initial status
  useEffect(() => {
    checkStatus();
    return () => stopPolling();
  }, [clientId]);

  const checkStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-whatsapp-instance", {
        body: { action: "check_bridge", client_id: clientId },
      });
      if (error || !data?.configured) {
        stopPolling();
        setStoredQrCode(null);
        setState("not_configured");
        return;
      }
      // Bridge is configured, check actual instance status
      await pollInstanceStatus();
    } catch {
      stopPolling();
      setStoredQrCode(null);
      setState("not_configured");
    }
  };

  const pollInstanceStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-whatsapp-instance", {
        body: { action: "instance_status", client_id: clientId },
      });
      if (error || data?.error) {
        stopPolling();
        setStoredQrCode(null);
        setState("disconnected");
        return;
      }
      const status = getBridgeStatus(data as BridgeResponse);
      const nextQrCode = getQrCodeFromResponse(data as BridgeResponse);

      if (CONNECTED_STATUSES.has(status)) {
        setStoredQrCode(null);
        setState("connected");
        stopPolling();
      } else if (nextQrCode) {
        setStoredQrCode(nextQrCode);
        setState("awaiting_scan");
      } else if (qrCodeRef.current) {
        setState("awaiting_scan");
      } else {
        // If the card is still in its initial loading state and the bridge only
        // reports a disconnected session, show the disconnected UI instead of
        // leaving the screen stuck in "Verificando conexão WhatsApp...".
        setState((current) => (current === "loading" ? "disconnected" : current));

        // During reconnect polling, keep waiting for QR to appear.
        pollAttemptsRef.current += 1;
        if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
          stopPolling();
          setStoredQrCode(null);
          setState("disconnected");
          toast.error("Tempo esgotado aguardando QR Code. Tente reconectar novamente.");
        }
      }
    } catch {
      stopPolling();
      setStoredQrCode(null);
      setState("disconnected");
    }
  };

  const startPolling = () => {
    stopPolling();
    pollAttemptsRef.current = 0;
    pollingRef.current = setInterval(async () => {
      await pollInstanceStatus();
    }, 3000);
  };

  const createNewInstance = async (successMessage: string) => {
    const { data, error } = await supabase.functions.invoke("manage-whatsapp-instance", {
      body: { action: "create_instance", client_id: clientId },
    });

    if (error) {
      throw new Error(error.message || "Erro desconhecido");
    }

    const response = (data ?? {}) as BridgeResponse;
    if (response.error && !response.requires_reconnect) {
      throw new Error(response.error);
    }

    const nextQrCode = getQrCodeFromResponse(response);
    const status = getBridgeStatus(response);

    if (nextQrCode) {
      setStoredQrCode(nextQrCode);
      setState("awaiting_scan");
      startPolling();
      toast.success(successMessage);
      return;
    }

    if (CONNECTED_STATUSES.has(status)) {
      setStoredQrCode(null);
      setState("connected");
      stopPolling();
      toast.success("WhatsApp conectado!");
      return;
    }

    // Bridge created the instance but didn't return a QR yet — common with UAZAPI.
    // Move to awaiting_scan and rely on polling to fetch the QR.
    setStoredQrCode(null);
    setState("awaiting_scan");
    startPolling();
    toast.info("Instância criada. Aguardando geração do QR Code...");
  };

  const handleCreateInstance = async () => {
    setCreating(true);
    try {
      await createNewInstance("Instância criada! Escaneie o QR Code com seu WhatsApp.");
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Tem certeza que deseja desconectar e remover esta instância do WhatsApp?")) {
      return;
    }

    setReconnecting(true);
    try {
      const { error } = await supabase.functions.invoke("manage-whatsapp-instance", {
        body: { action: "disconnect", client_id: clientId },
      });

      if (error) throw error;

      stopPolling();
      setStoredQrCode(null);
      setState("not_configured");
      toast.success("Instância desconectada com sucesso.");
    } catch (err: any) {
      toast.error("Erro ao desconectar: " + err.message);
    } finally {
      setReconnecting(false);
    }
  };

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-whatsapp-instance", {
        body: { action: "reconnect", client_id: clientId },
      });

      if (error || (data as BridgeResponse)?.error) {
        console.log("Reconnect failed, trying clean disconnect and recreate...");
        // If reconnect fails (e.g. 401), try explicit disconnect and recreate
        await supabase.functions.invoke("manage-whatsapp-instance", {
          body: { action: "disconnect", client_id: clientId },
        });
        await handleCreateInstance();
        return;
      }

      const response = (data ?? {}) as BridgeResponse;
      const nextQrCode = getQrCodeFromResponse(response);
      const status = getBridgeStatus(response);

      if (nextQrCode) {
        setStoredQrCode(nextQrCode);
        setState("awaiting_scan");
        startPolling();
        toast.info("Novo QR Code gerado. Escaneie novamente.");
        return;
      }

      if (CONNECTED_STATUSES.has(status)) {
        setStoredQrCode(null);
        setState("connected");
        stopPolling();
        toast.success("WhatsApp reconectado!");
        return;
      }

      // Fallback: check status again
      const { data: statusData, error: statusError } = await supabase.functions.invoke("manage-whatsapp-instance", {
        body: { action: "instance_status", client_id: clientId },
      });

      if (!statusError) {
        const latestResponse = (statusData ?? {}) as BridgeResponse;
        const latestQrCode = getQrCodeFromResponse(latestResponse);
        const latestStatus = getBridgeStatus(latestResponse);

        if (latestQrCode) {
          setStoredQrCode(latestQrCode);
          setState("awaiting_scan");
          startPolling();
          toast.info("Novo QR Code gerado. Escaneie novamente.");
          return;
        }

        if (CONNECTED_STATUSES.has(latestStatus)) {
          setStoredQrCode(null);
          setState("connected");
          stopPolling();
          toast.success("WhatsApp reconectado!");
          return;
        }
      }

      toast.info("A reconexão não retornou QR Code. Gerando uma nova instância...");
      await handleCreateInstance();
    } catch (err: any) {
      stopPolling();
      setStoredQrCode(null);
      setState("disconnected");
      toast.error("Erro: " + err.message);
    } finally {
      setReconnecting(false);
    }
  };

  const handleTestSend = async () => {
    const phone = testPhone;
    const normalizedPhone = cleanPhoneForBridge(phone);

    console.log("[TESTE WHATSAPP] digitado:", phone);
    console.log("[TESTE WHATSAPP] enviado para whatsapp-bridge:", normalizedPhone);

    if (!normalizedPhone || normalizedPhone.length < 10) {
      toast.error("Digite um número válido com DDI + DDD (ex: 5511999999999)");
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-whatsapp-instance", {
        body: {
          action: "send",
          client_id: clientId,
          phone: normalizedPhone,
          message: "✅ Teste de conexão WhatsApp — Sentinelle. Integração funcionando!",
        },
      });
      if (error) {
        toast.error("Falha no envio: " + error.message);
      } else if (data?.error) {
        toast.error("Falha: " + data.error);
      } else {
        toast.success("Mensagem de teste enviada com sucesso!");
      }
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setTesting(false);
    }
  };

  if (state === "loading") {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Verificando conexão WhatsApp...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1">
            <CardTitle>Conexão WhatsApp</CardTitle>
            <CardDescription>
              Conecte seu WhatsApp para envio de mensagens e disparos automáticos
            </CardDescription>
          </div>
          <StatusBadge state={state} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* NOT CONFIGURED */}
        {state === "not_configured" && (
          <div className="text-center space-y-4 py-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
              <QrCode className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Nenhuma instância WhatsApp conectada</p>
              <p className="text-sm text-muted-foreground mt-1">
                Clique abaixo para gerar um QR Code e conectar seu WhatsApp
              </p>
            </div>
            <Button
              onClick={handleCreateInstance}
              disabled={creating}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <QrCode className="w-4 h-4 mr-2" />
              )}
              {creating ? "Criando instância..." : "Conectar WhatsApp"}
            </Button>
          </div>
        )}

        {/* AWAITING SCAN */}
        {state === "awaiting_scan" && (
          <div className="text-center space-y-4 py-2">
            {qrCode ? (
              <>
                <div className="bg-white rounded-xl p-4 inline-block shadow-sm border">
                  <img src={qrCode} alt="QR Code WhatsApp" className="w-64 h-64 mx-auto" />
                </div>
                <div>
                  <p className="font-medium text-green-700 dark:text-green-400">
                    📱 Escaneie o QR Code com seu WhatsApp
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Abra o WhatsApp → Menu (⋮) → Aparelhos conectados → Conectar aparelho
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Aguardando leitura do QR Code...
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto">
                  <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                </div>
                <div>
                  <p className="font-medium">Gerando QR Code...</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Aguarde enquanto a ponte gera o QR Code para conexão.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* CONNECTED */}
        {state === "connected" && (
          <div className="space-y-4">
            <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  WhatsApp conectado e pronto!
                </p>
                <p className="text-xs text-emerald-600/70 dark:text-emerald-500/70 mt-0.5">
                  Sua instância está ativa. Disparos de mensagens serão enviados por este WhatsApp.
                </p>
              </div>
            </div>

            {/* Test send */}
            <div className="border rounded-lg p-4 space-y-3">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5" /> Enviar mensagem de teste
              </Label>
              <div className="flex gap-2">
                <Input
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="5511999999999"
                  className="font-mono max-w-[220px]"
                  maxLength={24}
                />
                <Button
                  onClick={handleTestSend}
                  disabled={testing || !testPhone}
                  variant="outline"
                  size="sm"
                >
                  {testing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                  Testar
                </Button>
              </div>
            </div>

            {/* Reconnect and Disconnect */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={handleReconnect}
                disabled={reconnecting}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                {reconnecting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                Reconectar
              </Button>
              <Button
                onClick={handleDisconnect}
                disabled={reconnecting}
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-600 hover:bg-red-50"
              >
                <Unplug className="w-4 h-4 mr-1" />
                Desconectar
              </Button>
            </div>
          </div>
        )}

        {/* DISCONNECTED */}
        {state === "disconnected" && (
          <div className="text-center space-y-4 py-4">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
              <Unplug className="w-8 h-8 text-red-500" />
            </div>
            <div>
              <p className="font-medium text-red-600 dark:text-red-400">WhatsApp desconectado</p>
              <p className="text-sm text-muted-foreground mt-1">
                A sessão expirou ou o aparelho foi desconectado. Reconecte escaneando um novo QR Code.
              </p>
            </div>
            <div className="flex flex-col gap-2 max-w-[280px] mx-auto">
              <Button
                onClick={handleReconnect}
                disabled={reconnecting}
                className="bg-green-600 hover:bg-green-700 text-white w-full"
              >
                {reconnecting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Reconectar WhatsApp
              </Button>
              <Button
                onClick={handleDisconnect}
                disabled={reconnecting}
                variant="ghost"
                className="text-muted-foreground hover:text-red-500 hover:bg-red-50"
              >
                <Unplug className="w-4 h-4 mr-2" />
                Remover instância
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ state }: { state: ConnectionState }) {
  if (state === "connected") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
        <Wifi className="w-3 h-3 mr-1" /> Conectado
      </Badge>
    );
  }
  if (state === "awaiting_scan") {
    return (
      <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">
        <QrCode className="w-3 h-3 mr-1" /> Aguardando QR
      </Badge>
    );
  }
  if (state === "disconnected") {
    return (
      <Badge className="bg-red-500/15 text-red-600 border-red-500/30">
        <WifiOff className="w-3 h-3 mr-1" /> Desconectado
      </Badge>
    );
  }
  return (
    <Badge className="bg-muted text-muted-foreground">
      <XCircle className="w-3 h-3 mr-1" /> Sem instância
    </Badge>
  );
}
